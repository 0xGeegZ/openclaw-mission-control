---
name: doc-generation
description: API documentation, code documentation, TypeDoc/JSDoc, Swagger/OpenAPI automation, and maintainable documentation practices
---

# Documentation Generation

## Overview

Build comprehensive, maintainable documentation through automation and best practices. This skill covers API docs, inline code documentation, and tools that keep docs in sync with code.

**Use this skill when:**
- Publishing APIs to external users or teams
- Onboarding new developers to the codebase
- Generating reference documentation
- Creating architecture diagrams
- Publishing TypeScript type definitions

**Cross-functional pairing:** @qa **mutation-testing** — Well-documented code is easier to test thoroughly; docs clarify intent and edge cases

---

## JSDoc & TypeDoc

### Inline Code Documentation with JSDoc

```typescript
/**
 * Fetches a user by ID from the database.
 * 
 * @param userId - The unique identifier of the user to fetch
 * @returns A promise that resolves to the User object, or null if not found
 * @throws {ValidationError} If userId is not a valid format
 * @example
 * const user = await getUser('user-123');
 * if (user) {
 *   console.log(`Hello, ${user.name}`);
 * }
 */
export async function getUser(userId: string): Promise<User | null> {
  if (!userId || !userId.startsWith('user-')) {
    throw new ValidationError('Invalid user ID format');
  }
  
  return db.get(userId);
}

/**
 * Generates a cryptographically secure random token.
 * 
 * @param length - Token length in bytes (default: 32)
 * @returns A hex-encoded random string
 * 
 * @example
 * const token = generateToken(16); // 32-char hex string
 * const refreshToken = generateToken(64); // 128-char hex string
 */
export function generateToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Configuration options for the API server.
 * 
 * @property port - The port to listen on (default: 3000)
 * @property host - The hostname to bind to (default: 'localhost')
 * @property tlsEnabled - Whether to enable TLS/HTTPS
 * @property logLevel - Logging verbosity ('debug' | 'info' | 'warn' | 'error')
 */
interface ServerConfig {
  port: number;
  host: string;
  tlsEnabled: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
```

### Generating TypeDoc Documentation

```bash
# Install TypeDoc
npm install --save-dev typedoc

# Generate HTML documentation
npx typedoc src/ --out docs/

# Generate markdown documentation
npx typedoc src/ --out docs/ --plugin typedoc-plugin-markdown
```

**tsconfig.json configuration:**
```json
{
  "compilerOptions": {
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "typedocOptions": {
    "entryPoints": ["src/index.ts"],
    "out": "docs",
    "titleLink": "https://example.com",
    "excludePrivate": true,
    "excludeInternal": true
  }
}
```

---

## Convex API Documentation

### Documenting Convex Mutations & Queries

```typescript
/**
 * Creates a new blog post.
 * 
 * @param title - Post title (1-200 characters)
 * @param content - Post content (markdown format)
 * @param tags - Optional tags for categorization
 * 
 * @returns The ID of the created post
 * 
 * @throws {ValidationError} If title is empty or content exceeds limits
 * @throws {AuthenticationError} If user is not authenticated
 * 
 * @example
 * const postId = await ctx.runMutation(api.posts.createPost, {
 *   title: 'My First Post',
 *   content: '# Hello World\n\nThis is my first post.',
 *   tags: ['hello', 'world'],
 * });
 */
export const createPost = mutation({
  args: {
    title: v.string(),
    content: v.string(),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    // Implementation
  },
});

/**
 * Lists all blog posts for the authenticated user.
 * 
 * @param limit - Maximum number of posts to return (default: 20, max: 100)
 * @param cursor - Cursor for pagination (from previous response)
 * 
 * @returns Object containing posts array and next cursor
 * 
 * @example
 * const { posts, nextCursor } = await ctx.runQuery(api.posts.listUserPosts, {
 *   limit: 50,
 * });
 * 
 * // Get next page
 * const { posts: nextPage } = await ctx.runQuery(api.posts.listUserPosts, {
 *   limit: 50,
 *   cursor: nextCursor,
 * });
 */
export const listUserPosts = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Implementation
  },
});
```

---

## OpenAPI/Swagger Documentation

### Generating OpenAPI from Next.js API Routes

```typescript
// api/posts/index.ts
/**
 * @swagger
 * /api/posts:
 *   get:
 *     summary: List all posts
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         required: false
 *         description: Page number (default: 1)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         required: false
 *         description: Items per page (default: 20, max: 100)
 *     responses:
 *       200:
 *         description: List of posts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 posts:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Post'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       400:
 *         description: Invalid query parameters
 *   post:
 *     summary: Create a new post
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreatePostRequest'
 *     responses:
 *       201:
 *         description: Post created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Post'
 *       401:
 *         description: Unauthorized
 */

import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'OpenClaw Blog API',
      version: '1.0.0',
      description: 'API for blog post management',
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development',
      },
      {
        url: 'https://api.example.com',
        description: 'Production',
      },
    ],
    components: {
      schemas: {
        Post: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            content: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
          required: ['id', 'title', 'content', 'createdAt'],
        },
        CreatePostRequest: {
          type: 'object',
          properties: {
            title: { type: 'string', minLength: 1, maxLength: 200 },
            content: { type: 'string', minLength: 1 },
            tags: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          required: ['title', 'content'],
        },
        Pagination: {
          type: 'object',
          properties: {
            page: { type: 'integer' },
            limit: { type: 'integer' },
            total: { type: 'integer' },
            pages: { type: 'integer' },
          },
        },
      },
    },
  },
  apis: ['./pages/api/**/*.ts'],
};

export const specs = swaggerJsdoc(options);

// In your Next.js config
import swaggerUi from 'swagger-ui-express';

export default function handler(req, res) {
  swaggerUi.setup(specs)(req, res);
}
```

### Generate and Serve OpenAPI Docs

```typescript
// pages/api/docs.ts
import { NextApiRequest, NextApiResponse } from 'next';
import swaggerUi from 'swagger-ui-express';
import { specs } from '@/lib/swagger';

const handler = swaggerUi.setup(specs, {
  swaggerUrl: '/api/swagger.json',
  customCss: '.swagger-ui { max-width: 1200px; margin: 0 auto; }',
});

export default handler;

// pages/api/swagger.json.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { specs } from '@/lib/swagger';

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader('Content-Type', 'application/json');
  res.write(JSON.stringify(specs, null, 2));
  res.end();
}
```

---

## Architecture Documentation

### C4 Model Diagrams

```markdown
# System Architecture

## Context Diagram

```
User <-> OpenClaw Web App <-> Convex Backend
         (Next.js + React)  (GraphQL API)
                |
                v
          Clerk Auth
```

## Container Diagram

```
OpenClaw System:
  ├─ Web Application (Next.js)
  │  ├─ Server Components
  │  ├─ Client Components
  │  └─ API Routes
  ├─ Backend (Convex)
  │  ├─ Database (Convex Storage)
  │  ├─ Queries
  │  ├─ Mutations
  │  └─ Webhooks
  └─ Authentication (Clerk)
     ├─ Sign In
     ├─ Sign Up
     └─ MFA

Data Flow:
  User -> Web App -> Convex API -> Database
```
```

### Using Mermaid for Diagrams

```typescript
// In markdown files
\`\`\`mermaid
graph TD
    A[User] -->|Login| B[Clerk Auth]
    B -->|Token| C[Web App]
    C -->|Query| D[Convex API]
    D -->|Results| C
    C -->|Render| A
\`\`\`

// Or in TypeScript
import mermaid from 'mermaid';

const diagram = `
  graph TD
    A[Start] --> B{Valid?}
    B -->|Yes| C[Process]
    B -->|No| D[Error]
`;

mermaid.render('diagram-id', diagram);
```

---

## README Best Practices

```markdown
# OpenClaw Mission Control

Brief description of the project (1-2 sentences).

## Features

- ✅ Feature 1
- ✅ Feature 2
- ✅ Feature 3

## Getting Started

### Prerequisites
- Node.js >= 24.0.0
- npm >= 11.0.0

### Installation

\`\`\`bash
npm install
\`\`\`

### Running Locally

\`\`\`bash
npm run dev
\`\`\`

## API Reference

See [API Docs](./docs/api.md) for endpoint documentation.

## Development Guide

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and conventions.

## Architecture

See [ARCHITECTURE.md](./docs/ARCHITECTURE.md) for system design and technical decisions.

## Testing

\`\`\`bash
npm test
\`\`\`

## Troubleshooting

### Common Issues

**Issue:** Build fails with "Cannot find module X"

**Solution:** 
1. Clear node_modules: \`rm -rf node_modules package-lock.json\`
2. Reinstall: \`npm install\`
3. Clear cache: \`npm cache clean --force\`

## License

MIT
```

---

## Keeping Docs in Sync with Code

### Automated Documentation Updates

```typescript
// CI/CD: Generate docs on every push
name: Update Documentation

on:
  push:
    branches: [master]

jobs:
  docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Install dependencies
        run: npm install
      
      - name: Generate TypeDoc
        run: npx typedoc src/ --out docs/api
      
      - name: Generate OpenAPI
        run: npx swagger-jsdoc --definition swagger.js --apis "pages/api/**/*.ts" > docs/swagger.json
      
      - name: Commit changes
        run: |
          git config user.name "Documentation Bot"
          git add docs/
          git commit -m "docs: auto-generated documentation [skip ci]" || true
          git push
```

### Documentation Validation

```typescript
// Ensure JSDoc exists for exported functions
import fs from 'fs';
import ts from 'typescript';

const validateJSDoc = (filePath: string) => {
  const source = fs.readFileSync(filePath, 'utf-8');
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest
  );
  
  const missingDocs: string[] = [];
  
  ts.forEachChild(sourceFile, (node) => {
    if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) {
      // Check if export
      const isExported = node.modifiers?.some(
        m => m.kind === ts.SyntaxKind.ExportKeyword
      );
      
      if (isExported && !ts.getLeadingCommentRanges(source, node.getStart())) {
        missingDocs.push(node.name?.text || 'unknown');
      }
    }
  });
  
  if (missingDocs.length > 0) {
    console.warn(`Missing JSDoc for: ${missingDocs.join(', ')}`);
  }
};
```

---

## Documentation Tools

| Tool | Purpose | Best For |
|------|---------|----------|
| **TypeDoc** | Auto-generate docs from JSDoc | TypeScript APIs |
| **Swagger/OpenAPI** | API specification & interactive docs | REST APIs |
| **Mermaid** | Diagram generation (markdown) | Architecture, workflows |
| **Docusaurus** | Documentation site | Large documentation |
| **Storybook** | Component documentation | UI components |
| **Plato** | Code complexity analysis | Code health reporting |

---

## Related Skills

- @api-design — Design APIs that are well-documented
- @logging-observability — Document observability patterns
- @backend-convex — Document Convex schema and functions
- @mutation-testing (QA) — Well-documented code is easier to test

## References

- [Google Technical Writing Course](https://developers.google.com/tech-writing)
- [The Good Docs Project](https://www.thegooddocsproject.dev/)
- [JSDoc Documentation](https://jsdoc.app/)
- [OpenAPI Specification](https://spec.openapis.org/)
- [Mermaid Diagrams](https://mermaid.js.org/)
