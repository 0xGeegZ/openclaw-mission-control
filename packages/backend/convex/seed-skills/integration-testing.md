---
name: integration-testing
description: Multi-service testing, contract testing with Pact, service mocking, and test data management
---

# Integration Testing

## Overview

Test interactions between multiple services and components to ensure they work correctly together. This skill covers integration test strategies, service mocking, contract testing, and test data management.

**Use this skill when:**
- Testing APIs that depend on other services
- Verifying microservices communication
- Testing database integration
- Validating external service interactions
- Ensuring contracts between services

## Integration Testing Pyramid

```
        E2E Tests (Cypress, Playwright)
       /                              \
      /        Few, Slow, Expensive    \
     /_________________________________ \
    /       Integration Tests           \
   /        Many, Medium Speed, Medium  \
  /____________________________________  \
 /         Unit Tests                    \
/__         Many, Fast, Cheap             \
  \
   Many    → More coverage, higher cost
   Few     ← Better ROI, catches regressions
```

## Types of Integration Tests

### API-to-Database Integration

```typescript
// Test: Create user → Save to DB → Query user
import { test, expect } from '@jest/globals';

describe('User API Integration with Database', () => {
  test('should create and retrieve user', async () => {
    // 1. Create user via API
    const createRes = await fetch('/api/users', {
      method: 'POST',
      body: JSON.stringify({
        email: 'test@example.com',
        name: 'Test User'
      })
    });
    
    expect(createRes.status).toBe(201);
    const user = await createRes.json();
    
    // 2. Query database directly to verify
    const dbUser = await db.users.findById(user.id);
    expect(dbUser.email).toBe('test@example.com');
    
    // 3. Retrieve via API and compare
    const getRes = await fetch(`/api/users/${user.id}`);
    const retrievedUser = await getRes.json();
    expect(retrievedUser.email).toBe('test@example.com');
  });
});
```

### Service-to-Service Integration

```typescript
// Test: User Service calls Email Service
describe('User Service Integration with Email Service', () => {
  test('should send welcome email when user registers', async () => {
    // Mock Email Service
    const emailServiceMock = jest.mock('email-service');
    emailServiceMock.send = jest.fn().mockResolvedValue({ sent: true });
    
    // Call User Service
    const user = await userService.register({
      email: 'test@example.com',
      name: 'Test User'
    });
    
    // Verify Email Service was called
    expect(emailServiceMock.send).toHaveBeenCalledWith({
      to: 'test@example.com',
      template: 'welcome',
      variables: { name: 'Test User' }
    });
  });
});
```

## Contract Testing with Pact

Contract testing verifies that services agree on communication format without requiring both services running.

### Setup Pact

```bash
npm install --save-dev @pact-foundation/pact jest
```

### Consumer Test (Client Side)

```typescript
// user-api.test.ts - Consumer tests what it expects from API
import { PactV3 } from '@pact-foundation/pact';

const provider = new PactV3({
  consumer: 'UserUI',
  provider: 'UserAPI'
});

describe('User API Contract', () => {
  test('should get user by ID', async () => {
    await provider
      .addInteraction({
        states: [{ description: 'user 123 exists' }],
        uponReceiving: 'a request for user 123',
        withRequest: {
          method: 'GET',
          path: '/api/users/123'
        },
        willRespondWith: {
          status: 200,
          body: {
            id: '123',
            name: 'John Doe',
            email: 'john@example.com'
          }
        }
      })
      .executeTest(async (mockServer) => {
        const user = await fetch(`${mockServer.url}/api/users/123`);
        expect(user.name).toBe('John Doe');
      });
  });
});
```

### Provider Test (Server Side)

```typescript
// user-api.provider.test.ts - Provider verifies it meets contract
import { Verifier } from '@pact-foundation/pact';

describe('User API Provider', () => {
  test('should meet user-ui consumer contract', async () => {
    const verifier = new Verifier({
      providerBaseUrl: 'http://localhost:3000',
      pactUrls: ['./pacts/userui-userapi.json']
    });

    await verifier
      .withStateHandler('user 123 exists', async () => {
        await db.users.create({
          id: '123',
          name: 'John Doe',
          email: 'john@example.com'
        });
      })
      .verifyProvider();
  });
});
```

**Benefits:**
- Services can develop independently
- Catch breaking changes early
- Prevent integration surprises
- Clear contract documentation

## Service Mocking

### HTTP Mocking with MSW (Mock Service Worker)

```typescript
// handlers.ts
import { http, HttpResponse } from 'msw';

export const handlers = [
  // Mock GET /api/users
  http.get('http://localhost:3000/api/users', () => {
    return HttpResponse.json([
      { id: '1', name: 'John', email: 'john@example.com' },
      { id: '2', name: 'Jane', email: 'jane@example.com' }
    ]);
  }),

  // Mock POST /api/users
  http.post('http://localhost:3000/api/users', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({
      id: '3',
      ...body
    }, { status: 201 });
  })
];
```

**Using in Tests:**

```typescript
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

const server = setupServer(...handlers);

describe('User Service', () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  test('should fetch users', async () => {
    const users = await userService.getUsers();
    expect(users).toHaveLength(2);
    expect(users[0].name).toBe('John');
  });

  test('should handle custom response', async () => {
    server.use(
      http.get('http://localhost:3000/api/users', () => {
        return HttpResponse.json([], { status: 500 });
      })
    );

    await expect(userService.getUsers()).rejects.toThrow();
  });
});
```

## Test Data Management

### Fixture Factory Pattern

```typescript
// factories.ts
export function createUser(overrides = {}) {
  return {
    id: '123',
    email: 'test@example.com',
    name: 'Test User',
    createdAt: new Date(),
    ...overrides
  };
}

export function createPost(overrides = {}) {
  return {
    id: '456',
    userId: '123',
    title: 'Test Post',
    content: 'Test content',
    ...overrides
  };
}

// In tests
test('should create post for user', () => {
  const user = createUser({ email: 'john@example.com' });
  const post = createPost({ userId: user.id });
  
  expect(post.userId).toBe(user.id);
});
```

### Database Setup/Teardown

```typescript
describe('User Repository', () => {
  beforeEach(async () => {
    // Clear database
    await db.users.deleteMany({});
    
    // Seed test data
    await db.users.insert([
      createUser({ id: '1' }),
      createUser({ id: '2' })
    ]);
  });

  afterEach(async () => {
    // Clean up after test
    await db.users.deleteMany({});
  });

  test('should find user by email', async () => {
    const user = await db.users.findByEmail('test@example.com');
    expect(user).toBeDefined();
  });
});
```

### Transaction Isolation

```typescript
// Use transactions to keep tests isolated
describe('User Service with Transactions', () => {
  test('should rollback failed transactions', async () => {
    const tx = db.transaction();
    
    try {
      await tx.users.insert({ email: 'test@example.com' });
      await tx.profiles.insert({ userId: 'invalid' }); // Fails
      await tx.commit();
    } catch {
      await tx.rollback();
    }

    // User should not exist
    const user = await db.users.findByEmail('test@example.com');
    expect(user).toBeNull();
  });
});
```

## Testing Async Workflows

### Event-Driven Integration

```typescript
// Test: Publish event → Service consumes → DB updated
describe('Event-Driven Integration', () => {
  test('should update user profile on user-updated event', async () => {
    const eventBus = new EventEmitter();
    const profileService = new ProfileService(eventBus);

    // Listen for profile-updated event
    const profileUpdated = new Promise(resolve => {
      eventBus.on('profile:updated', resolve);
    });

    // Publish event
    eventBus.emit('user:updated', {
      userId: '123',
      name: 'Updated Name'
    });

    // Wait for profile service to process
    await profileUpdated;

    // Verify DB updated
    const profile = await db.profiles.findByUserId('123');
    expect(profile.name).toBe('Updated Name');
  });
});
```

### Queue/Message Testing

```typescript
// Test: Message published → Service consumes → Action performed
describe('Message Queue Integration', () => {
  test('should process email queue message', async () => {
    const queue = new MessageQueue();

    // Listen for processing
    const processed = jest.fn();
    queue.on('processed', processed);

    // Publish message
    await queue.publish('emails', {
      to: 'test@example.com',
      template: 'welcome'
    });

    // Process queue
    await queue.process('emails', async (msg) => {
      await emailService.send(msg);
      processed();
    });

    // Verify
    expect(emailService.send).toHaveBeenCalled();
    expect(processed).toHaveBeenCalled();
  });
});
```

## Integration Test Checklist

- [ ] Test APIs with actual database
- [ ] Test service-to-service communication
- [ ] Use Pact for contract testing
- [ ] Mock external services (HTTP, queues)
- [ ] Test error scenarios (service down, timeout)
- [ ] Use factory functions for test data
- [ ] Clean up test data after each test
- [ ] Test async workflows with proper waiting
- [ ] Document test scenarios
- [ ] Run integration tests in CI/CD

## Common Pitfalls

**❌ Avoid:**
- Testing implementation details
- Creating integration tests for simple logic
- Not cleaning up test data
- Testing with production data
- Brittle tests that break with minor changes

**✅ Do:**
- Test behavior, not implementation
- Use integration tests for complex interactions
- Use fixtures/factories for data
- Mock external dependencies
- Keep tests maintainable

## Related Skills

- @test-automation - Implement automated integration tests
- @backend-convex - Test Convex database integration
- @api-design - Test API contracts and schemas
- @security-hardening - Test security in integrations
