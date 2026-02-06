---
name: contract-testing-openapi
description: OpenAPI contract testing, API schema validation, service mocking, and ensuring API contracts remain in sync with implementation
---

# Contract Testing & OpenAPI

## Overview

Ensure API contracts remain consistent between consumers and providers through contract testing with OpenAPI schema validation. This skill covers contract-first testing, schema validation, service mocking, and preventing API breaking changes.

**Use this skill when:**
- Evolving API contracts safely
- Ensuring frontend/backend API alignment
- Validating API responses against schema
- Testing service integrations
- Preventing breaking API changes

**Cross-functional pairing:** @engineer **error-handling-resilience** — Contract tests validate error responses conform to API contracts and are properly documented

---

## Contract-First Testing Approach

### What is Contract Testing?

**Traditional API Testing:**

```typescript
// ❌ Bad: Tests implementation details
test('GET /users returns array of users', async () => {
  const response = await api.get('/users');
  
  // Tightly coupled to implementation
  expect(response.body[0].name).toBe('John');
  expect(response.body[0].email).toBeDefined();
});
```

**Contract Testing:**

```typescript
// ✅ Good: Tests the contract (schema)
test('GET /users conforms to OpenAPI schema', async () => {
  const response = await api.get('/users');
  
  // Validates against contract
  expect(response).toConformToSchema(openAPISpec, '/users', 'get');
  expect(response.statusCode).toBe(200);
});
```

### Consumer vs. Provider

```
Consumer (Frontend)          Provider (Backend)
    ↓                               ↓
  Expects API to return:      Implements API to return:
  - User with id, name        - User(id, name, email)
  - Status 200                - Status 200
    ↓                               ↓
    └──────── OpenAPI Contract ────→
           (Single source of truth)
```

---

## OpenAPI Schema Definition

### Basic OpenAPI Schema

```yaml
# openapi.yaml
openapi: 3.0.0
info:
  title: OpenClaw API
  version: 1.0.0

paths:
  /api/users:
    get:
      summary: List all users
      responses:
        '200':
          description: List of users
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/User'
    
    post:
      summary: Create user
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateUserRequest'
      responses:
        '201':
          description: User created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'

  /api/users/{id}:
    get:
      summary: Get user by ID
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: User found
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'
        '404':
          description: User not found

components:
  schemas:
    User:
      type: object
      required: [id, name, email, createdAt]
      properties:
        id:
          type: string
        name:
          type: string
        email:
          type: string
          format: email
        createdAt:
          type: string
          format: date-time

    CreateUserRequest:
      type: object
      required: [name, email]
      properties:
        name:
          type: string
        email:
          type: string
          format: email
```

---

## Schema Validation Testing

### Validate Response Against Schema

```typescript
import Ajv from 'ajv';
import openAPISpec from './openapi.yaml';

const ajv = new Ajv();

// Compile schemas from OpenAPI spec
const userListSchema = ajv.getSchema('#/components/schemas/User');
const userSchema = ajv.getSchema('#/components/schemas/User');

test('GET /users response conforms to schema', async () => {
  const response = await fetch('http://localhost:3000/api/users');
  const data = await response.json();
  
  // Validate each user
  const valid = data.every(user => userSchema(user));
  expect(valid).toBe(true);
});

test('Error responses conform to error schema', async () => {
  const response = await fetch('http://localhost:3000/api/users/invalid');
  const data = await response.json();
  
  // Validate error format
  expect(data.error).toBeDefined();
  expect(data.statusCode).toBe(404);
});
```

### Using OpenAPI Validator

```bash
npm install --save-dev openapi-validator

# Validate API implementation
openapi-validator validate \
  --spec openapi.yaml \
  --server http://localhost:3000
```

---

## Consumer Contract Tests

```typescript
import { PactV3 } from '@pact-foundation/pact';

const provider = new PactV3({
  consumer: 'WebApp',
  provider: 'UserAPI'
});

describe('User API Consumer Contract', () => {
  test('GET /users returns user list', async () => {
    await provider
      .addInteraction({
        states: [{ description: 'users exist' }],
        uponReceiving: 'a request for all users',
        withRequest: {
          method: 'GET',
          path: '/api/users',
        },
        willRespondWith: {
          status: 200,
          body: [
            {
              id: expect.any(String),
              name: expect.any(String),
              email: expect.any(String),
              createdAt: expect.any(String),
            },
          ],
        },
      })
      .executeTest(async (mockServer) => {
        const response = await fetch(`${mockServer.url}/api/users`);
        const users = await response.json();
        
        expect(users).toHaveLength(1);
        expect(users[0].id).toBeDefined();
      });
  });

  test('POST /users creates user', async () => {
    await provider
      .addInteraction({
        uponReceiving: 'a request to create a user',
        withRequest: {
          method: 'POST',
          path: '/api/users',
          body: {
            name: 'Jane Doe',
            email: 'jane@example.com',
          },
        },
        willRespondWith: {
          status: 201,
          body: {
            id: expect.any(String),
            name: 'Jane Doe',
            email: 'jane@example.com',
            createdAt: expect.any(String),
          },
        },
      })
      .executeTest(async (mockServer) => {
        const response = await fetch(`${mockServer.url}/api/users`, {
          method: 'POST',
          body: JSON.stringify({ name: 'Jane Doe', email: 'jane@example.com' }),
        });
        
        expect(response.status).toBe(201);
      });
  });
});
```

---

## Service Mocking for Contract Tests

### Mock Service Using OpenAPI Schema

```typescript
import { createMockServer } from 'openapi-backend';

const mockAPI = createMockServer({
  definition: './openapi.yaml',
  strict: true,  // Strict schema validation
});

// Mock GET /users
mockAPI.mock.register({
  operationId: 'listUsers',
  handler: (_c, _req, res) => {
    res.status(200).json([
      { id: '1', name: 'John', email: 'john@example.com', createdAt: '2026-01-01T00:00:00Z' },
      { id: '2', name: 'Jane', email: 'jane@example.com', createdAt: '2026-01-02T00:00:00Z' },
    ]);
  },
});

// Mock POST /users
mockAPI.mock.register({
  operationId: 'createUser',
  handler: (c, _req, res) => {
    const { name, email } = c.request.body;
    res.status(201).json({
      id: 'new-id',
      name,
      email,
      createdAt: new Date().toISOString(),
    });
  },
});

test('create user via mocked API', async () => {
  const response = await mockAPI.handleRequest({
    method: 'POST',
    url: '/api/users',
    body: { name: 'Bob', email: 'bob@example.com' },
  });
  
  expect(response.status).toBe(201);
  expect(response.body.name).toBe('Bob');
});
```

---

## Error Contract Testing

### Validate Error Responses

```typescript
const errorSchema = {
  type: 'object',
  required: ['error', 'statusCode', 'message'],
  properties: {
    error: { type: 'string' },
    statusCode: { type: 'number' },
    message: { type: 'string' },
    details: { type: 'object' },
  },
};

test('404 error conforms to contract', async () => {
  const response = await fetch('http://localhost:3000/api/users/invalid');
  const data = await response.json();
  
  expect(response.status).toBe(404);
  expect(ajv.validate(errorSchema, data)).toBe(true);
});

test('validation error includes details', async () => {
  const response = await fetch('http://localhost:3000/api/users', {
    method: 'POST',
    body: JSON.stringify({ name: '' }),  // Invalid
  });
  const data = await response.json();
  
  expect(response.status).toBe(400);
  expect(data.error).toBe('VALIDATION_ERROR');
  expect(data.details).toBeDefined();
});
```

---

## Contract Evolution

### Breaking vs. Non-Breaking Changes

```yaml
# ✅ Non-breaking: Add optional field
User:
  properties:
    id: { type: string }
    name: { type: string }
    email: { type: string }
    phone: { type: string }  # NEW: Optional

# ❌ Breaking: Remove required field
User:
  required: [id, name]
  # email removed (breaking!)

# ❌ Breaking: Change type
User:
  properties:
    age: { type: number }  # Was: string (breaking!)

# ✅ Non-breaking: Relax constraint
User:
  properties:
    phone: { type: string }  # Removed required constraint
```

### Versioning Strategy

```yaml
# api/v1/openapi.yaml - Stable
# api/v2/openapi.yaml - New features, deprecated endpoints

paths:
  /api/v1/users:
    get:
      # stable endpoint
  
  /api/v2/users:
    get:
      # new endpoint with enhancements
```

---

## CI/CD Contract Validation

### GitHub Actions

```yaml
# .github/workflows/contract-test.yml
name: Contract Tests

on: [push, pull_request]

jobs:
  contract:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      
      - run: npm ci
      - run: npm run test:contract
      
      - name: Validate OpenAPI schema
        run: npx openapi-validator validate --spec openapi.yaml
      
      - name: Check for breaking changes
        run: |
          npx openapi-diff openapi-old.yaml openapi.yaml \
            --fail-on-breaking
```

---

## Contract Testing Checklist

- [ ] OpenAPI schema defined for all endpoints
- [ ] Consumer contract tests written
- [ ] Schema validation integrated in tests
- [ ] Error responses conform to schema
- [ ] Breaking changes detected in CI/CD
- [ ] Non-breaking changes allowed
- [ ] Mock server validates against schema
- [ ] API versioning strategy defined
- [ ] Contract tests run before deployment
- [ ] Pact/OpenAPI contracts shared between teams

---

## Related Skills

- @error-handling-resilience - Error responses must conform to contracts
- @test-coverage-analysis - Coverage for contract test paths
- @api-design - Define contracts before implementation
- @regression-testing - Detect contract regressions
