---
name: api-design
description: RESTful and GraphQL API design, OpenAPI documentation, versioning strategies, and API contracts
---

# API Design

## Overview

Design scalable, maintainable APIs using REST and GraphQL best practices. This skill covers API contracts, OpenAPI documentation, versioning strategies, and backward compatibility.

**Use this skill when:**
- Designing new API endpoints
- Creating API documentation
- Planning API versioning
- Evaluating REST vs. GraphQL trade-offs
- Establishing API governance standards

## REST API Design Principles

### Resource-Oriented Design

Model your API around resources, not actions.

**❌ Wrong (action-oriented):**
```
POST /api/users/123/sendEmail
POST /api/invoices/456/generate
GET /api/getActiveUsers
```

**✅ Right (resource-oriented):**
```
POST /api/users/123/emails          # Create email resource
POST /api/invoices/456/pdf          # Create PDF resource
GET /api/users?status=active        # Query resource
```

### HTTP Methods (Semantics Matter)

| Method | Semantics | Idempotent | Safe | Example |
|--------|-----------|-----------|------|---------|
| GET | Retrieve | Yes | Yes | `GET /api/users/123` |
| POST | Create | No | No | `POST /api/users` |
| PUT | Replace full | Yes | No | `PUT /api/users/123` |
| PATCH | Partial update | No | No | `PATCH /api/users/123` |
| DELETE | Remove | Yes | No | `DELETE /api/users/123` |

### HTTP Status Codes (Standard)

**2xx Success:**
- 200 OK - Successful GET/PUT/PATCH
- 201 Created - Successful POST
- 204 No Content - Successful DELETE

**4xx Client Error:**
- 400 Bad Request - Invalid parameters
- 401 Unauthorized - Missing credentials
- 403 Forbidden - Authenticated but not authorized
- 404 Not Found - Resource doesn't exist
- 422 Unprocessable Entity - Validation failed

**5xx Server Error:**
- 500 Internal Server Error
- 503 Service Unavailable

### API Versioning Strategy

**Option 1: URL Path (Recommended for major breaking changes)**
```
GET /api/v1/users
GET /api/v2/users      # Different response structure
```

**Option 2: Query Parameter**
```
GET /api/users?version=1
GET /api/users?version=2
```

**Option 3: Accept Header (Content negotiation)**
```
GET /api/users
Accept: application/vnd.company.v1+json
```

**Best Practice:**
- Use URL path for major versions (v1, v2, etc.)
- Use headers for minor versions and formats
- Deprecate old versions with warning headers
- Maintain 2 versions max in production

### Pagination

```typescript
// Good pagination implementation
GET /api/users?page=2&limit=50

Response: {
  data: [...],
  pagination: {
    page: 2,
    limit: 50,
    total: 1000,
    pages: 20,
    hasMore: true
  }
}
```

### Filtering & Sorting

```typescript
// Filtering
GET /api/users?status=active&role=admin

// Sorting
GET /api/users?sort=-createdAt,name  // desc by date, asc by name

// Sparse fields (bandwidth optimization)
GET /api/users?fields=id,name,email
```

## GraphQL Design

### Schema Best Practices

```graphql
type User {
  id: ID!
  email: String!
  name: String!
  createdAt: DateTime!
  posts(first: 10, after: String): PostConnection!
}

type Query {
  user(id: ID!): User
  users(first: 10, after: String): UserConnection!
  search(query: String!): SearchResult!
}

type Mutation {
  createUser(input: CreateUserInput!): CreateUserPayload!
  updateUser(id: ID!, input: UpdateUserInput!): UpdateUserPayload!
  deleteUser(id: ID!): DeleteUserPayload!
}
```

### Key Principles

1. **Type Safety:** All fields and arguments strongly typed
2. **Null Safety:** Use `!` (non-null) carefully
3. **Connections Pattern:** Use for pagination and filtering
4. **Input Types:** Wrap mutations in dedicated input types
5. **Payloads:** Return status + data from mutations

## API Documentation (OpenAPI/Swagger)

### Minimal OpenAPI Example

```yaml
openapi: 3.0.0
info:
  title: User API
  version: 1.0.0
paths:
  /api/users:
    get:
      summary: List users
      parameters:
        - name: page
          in: query
          schema: { type: integer, default: 1 }
        - name: limit
          in: query
          schema: { type: integer, default: 50 }
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
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
              $ref: '#/components/schemas/CreateUserInput'
      responses:
        '201':
          description: Created
components:
  schemas:
    User:
      type: object
      properties:
        id: { type: string }
        email: { type: string, format: email }
        name: { type: string }
```

### Documentation Tools

- **Swagger UI:** Interactive API explorer
- **ReDoc:** Beautiful documentation site
- **Stoplight:** Visual API design tool
- **Postman:** API testing and documentation

## REST vs. GraphQL Decision Matrix

| Criteria | REST | GraphQL |
|----------|------|---------|
| Learning Curve | Low | Steep |
| Performance | Network requests can be multiple | Single request, precise fields |
| Caching | HTTP cache friendly | Requires custom layer |
| Real-time | Polling or WebSocket | Subscriptions built-in |
| Complexity | Low (CRUD) to high (complex queries) | High (query optimization) |
| Team Size | Good for small teams | Better for large teams |

**Use REST for:** Simple CRUD APIs, microservices, public APIs, CDN-able resources

**Use GraphQL for:** Complex nested data, mobile clients, rapid frontend iteration

## API Security

1. **Authentication**
   - JWT tokens for stateless auth
   - OAuth 2.0 for third-party access
   - API keys for service-to-service

2. **Authorization**
   - Role-based access control (RBAC)
   - Scope-based permissions
   - Resource ownership validation

3. **Rate Limiting**
   ```
   X-RateLimit-Limit: 1000
   X-RateLimit-Remaining: 999
   X-RateLimit-Reset: 1234567890
   ```

4. **Input Validation**
   - Whitelist allowed characters
   - Length limits
   - Type validation

## Related Skills

- @backend-convex - Implement APIs in Convex
- @doc-generation - Auto-generate API documentation
- @security-hardening - Secure API endpoints
- @performance-profiling - Optimize API response times
