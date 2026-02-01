# Module 06: Documents Module

> Implement document management for deliverables and notes.

---

## ESSENTIAL CONTEXT — READ FIRST

**Before implementing this module, you MUST read:**

1. **`docs/mission-control-initial-article.md`** — Document/deliverable concepts (Section 10)
2. **`docs/mission-control-cursor-core-instructions.md`** — Data model invariants (Section 4)
3. **`.cursor/rules/05-convex.mdc`** — Convex patterns

**Key understanding:**
- Documents = deliverables, notes, templates, references
- Can be linked to tasks (optional)
- Version tracking on content changes
- Both users and agents can author documents

---

## 1. Context & Goal

We are implementing the document management system for Mission Control. Documents store deliverables, notes, templates, and reference materials created by users and agents.

**What we're building:**
- Document CRUD: Create, read, update, delete documents
- Document types: deliverable, note, template, reference
- Task linking: Optional association with tasks
- Version tracking: Track document versions
- Author attribution: Support user and agent authors

**Key constraints:**
- Documents scoped to accounts
- Documents can optionally link to tasks
- Version increments on each edit
- All changes logged to activities
- Markdown content support

---

## 2. Codebase Research Summary

### Files to Reference

- `packages/backend/convex/schema.ts` - Documents table definition
- `packages/shared/src/types/index.ts` - DocumentType type
- `packages/backend/convex/lib/auth.ts` - Auth guards

### Document Schema Reference

```typescript
documents: defineTable({
  accountId: v.id("accounts"),
  taskId: v.optional(v.id("tasks")),
  title: v.string(),
  content: v.string(),
  type: documentTypeValidator,
  authorType: recipientTypeValidator,
  authorId: v.string(),
  version: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
```

---

## 3. High-level Design

### Document Lifecycle

```
1. User/Agent creates document → Initial version 1
2. Document edited → Version increments
3. Document linked to task → taskId set
4. Document archived/deleted → Remove record
```

### Document Types

| Type | Purpose | Example |
|------|---------|---------|
| `deliverable` | Final work output | Design spec, analysis report |
| `note` | Working notes | Research notes, ideas |
| `template` | Reusable templates | Status update template |
| `reference` | Reference material | Guidelines, procedures |

---

## 4. File & Module Changes

### Files to Create

| Path | Purpose |
|------|---------|
| `packages/backend/convex/documents.ts` | Document CRUD operations |
| `packages/backend/convex/service/documents.ts` | Service functions for agents |

---

## 5. Step-by-Step Tasks

### Step 1: Create Documents Module

Create `packages/backend/convex/documents.ts`:

```typescript
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAccountMember } from "./lib/auth";
import { documentTypeValidator, recipientTypeValidator } from "./lib/validators";
import { logActivity } from "./lib/activity";

/**
 * List documents for an account.
 * Supports filtering by type and task.
 */
export const list = query({
  args: {
    accountId: v.id("accounts"),
    type: v.optional(documentTypeValidator),
    taskId: v.optional(v.id("tasks")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);
    
    let documents;
    
    if (args.taskId) {
      // Filter by task
      documents = await ctx.db
        .query("documents")
        .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
        .collect();
    } else {
      // Get all for account
      documents = await ctx.db
        .query("documents")
        .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
        .collect();
    }
    
    // Filter by type if provided
    if (args.type) {
      documents = documents.filter(d => d.type === args.type);
    }
    
    // Sort by updated (most recent first)
    documents.sort((a, b) => b.updatedAt - a.updatedAt);
    
    // Apply limit
    if (args.limit) {
      documents = documents.slice(0, args.limit);
    }
    
    return documents;
  },
});

/**
 * List documents by type.
 */
export const listByType = query({
  args: {
    accountId: v.id("accounts"),
    type: documentTypeValidator,
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);
    
    return ctx.db
      .query("documents")
      .withIndex("by_account_type", (q) => 
        q.eq("accountId", args.accountId).eq("type", args.type)
      )
      .collect();
  },
});

/**
 * List documents linked to a specific task.
 */
export const listByTask = query({
  args: {
    taskId: v.id("tasks"),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      return [];
    }
    
    await requireAccountMember(ctx, task.accountId);
    
    return ctx.db
      .query("documents")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
  },
});

/**
 * Get a single document by ID.
 */
export const get = query({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);
    if (!document) {
      return null;
    }
    
    await requireAccountMember(ctx, document.accountId);
    return document;
  },
});

/**
 * Search documents by title.
 * Simple text search (case-insensitive contains).
 */
export const search = query({
  args: {
    accountId: v.id("accounts"),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);
    
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();
    
    const searchLower = args.query.toLowerCase();
    let results = documents.filter(d => 
      d.title.toLowerCase().includes(searchLower) ||
      d.content.toLowerCase().includes(searchLower)
    );
    
    // Sort by relevance (title matches first, then by updated)
    results.sort((a, b) => {
      const aTitle = a.title.toLowerCase().includes(searchLower);
      const bTitle = b.title.toLowerCase().includes(searchLower);
      
      if (aTitle && !bTitle) return -1;
      if (!aTitle && bTitle) return 1;
      
      return b.updatedAt - a.updatedAt;
    });
    
    if (args.limit) {
      results = results.slice(0, args.limit);
    }
    
    return results;
  },
});

/**
 * Create a new document.
 */
export const create = mutation({
  args: {
    accountId: v.id("accounts"),
    title: v.string(),
    content: v.string(),
    type: documentTypeValidator,
    taskId: v.optional(v.id("tasks")),
  },
  handler: async (ctx, args) => {
    const { userId, userName } = await requireAccountMember(ctx, args.accountId);
    
    // Validate task if provided
    if (args.taskId) {
      const task = await ctx.db.get(args.taskId);
      if (!task || task.accountId !== args.accountId) {
        throw new Error("Invalid task: Task does not exist or belongs to different account");
      }
    }
    
    const now = Date.now();
    
    const documentId = await ctx.db.insert("documents", {
      accountId: args.accountId,
      taskId: args.taskId,
      title: args.title,
      content: args.content,
      type: args.type,
      authorType: "user",
      authorId: userId,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    
    // Log activity
    await logActivity({
      ctx,
      accountId: args.accountId,
      type: "document_created",
      actorType: "user",
      actorId: userId,
      actorName: userName,
      targetType: "document",
      targetId: documentId,
      targetName: args.title,
      meta: { type: args.type, taskId: args.taskId },
    });
    
    return documentId;
  },
});

/**
 * Update a document.
 * Increments version on content changes.
 */
export const update = mutation({
  args: {
    documentId: v.id("documents"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    type: v.optional(documentTypeValidator),
    taskId: v.optional(v.id("tasks")),
  },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);
    if (!document) {
      throw new Error("Not found: Document does not exist");
    }
    
    const { userId, userName } = await requireAccountMember(ctx, document.accountId);
    
    // Validate new task if provided
    if (args.taskId !== undefined && args.taskId !== null) {
      const task = await ctx.db.get(args.taskId);
      if (!task || task.accountId !== document.accountId) {
        throw new Error("Invalid task");
      }
    }
    
    const updates: Record<string, unknown> = {
      updatedAt: Date.now(),
    };
    
    let versionIncrement = false;
    
    if (args.title !== undefined) updates.title = args.title;
    if (args.type !== undefined) updates.type = args.type;
    if (args.taskId !== undefined) updates.taskId = args.taskId;
    
    // Increment version only on content changes
    if (args.content !== undefined && args.content !== document.content) {
      updates.content = args.content;
      updates.version = document.version + 1;
      versionIncrement = true;
    }
    
    await ctx.db.patch(args.documentId, updates);
    
    // Log activity
    await logActivity({
      ctx,
      accountId: document.accountId,
      type: "document_updated",
      actorType: "user",
      actorId: userId,
      actorName: userName,
      targetType: "document",
      targetId: args.documentId,
      targetName: args.title ?? document.title,
      meta: { 
        versionIncrement,
        newVersion: versionIncrement ? document.version + 1 : document.version,
        fields: Object.keys(updates).filter(k => k !== "updatedAt"),
      },
    });
    
    return args.documentId;
  },
});

/**
 * Link/unlink a document to a task.
 */
export const linkToTask = mutation({
  args: {
    documentId: v.id("documents"),
    taskId: v.optional(v.id("tasks")),
  },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);
    if (!document) {
      throw new Error("Not found: Document does not exist");
    }
    
    const { userId, userName } = await requireAccountMember(ctx, document.accountId);
    
    // Validate task if linking
    if (args.taskId) {
      const task = await ctx.db.get(args.taskId);
      if (!task || task.accountId !== document.accountId) {
        throw new Error("Invalid task");
      }
    }
    
    await ctx.db.patch(args.documentId, {
      taskId: args.taskId,
      updatedAt: Date.now(),
    });
    
    // Log activity
    await logActivity({
      ctx,
      accountId: document.accountId,
      type: "document_updated",
      actorType: "user",
      actorId: userId,
      actorName: userName,
      targetType: "document",
      targetId: args.documentId,
      targetName: document.title,
      meta: { action: args.taskId ? "linked" : "unlinked", taskId: args.taskId },
    });
    
    return args.documentId;
  },
});

/**
 * Delete a document.
 */
export const remove = mutation({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);
    if (!document) {
      throw new Error("Not found: Document does not exist");
    }
    
    await requireAccountMember(ctx, document.accountId);
    
    await ctx.db.delete(args.documentId);
    
    return true;
  },
});

/**
 * Duplicate a document.
 * Creates a copy with "(Copy)" appended to title.
 */
export const duplicate = mutation({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);
    if (!document) {
      throw new Error("Not found: Document does not exist");
    }
    
    const { userId, userName } = await requireAccountMember(ctx, document.accountId);
    
    const now = Date.now();
    
    const newDocumentId = await ctx.db.insert("documents", {
      accountId: document.accountId,
      taskId: document.taskId,
      title: `${document.title} (Copy)`,
      content: document.content,
      type: document.type,
      authorType: "user",
      authorId: userId,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    
    // Log activity
    await logActivity({
      ctx,
      accountId: document.accountId,
      type: "document_created",
      actorType: "user",
      actorId: userId,
      actorName: userName,
      targetType: "document",
      targetId: newDocumentId,
      targetName: `${document.title} (Copy)`,
      meta: { duplicatedFrom: args.documentId },
    });
    
    return newDocumentId;
  },
});
```

### Step 2: Create Service Documents Module

Create `packages/backend/convex/service/documents.ts`:

```typescript
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { documentTypeValidator } from "../lib/validators";
import { logActivity } from "../lib/activity";

/**
 * Service-only document functions.
 * Called by agents via the runtime service.
 */

/**
 * Create or update a document from an agent.
 * If documentId is provided, updates existing. Otherwise creates new.
 */
export const createOrUpdateFromAgent = internalMutation({
  args: {
    agentId: v.id("agents"),
    documentId: v.optional(v.id("documents")),
    taskId: v.optional(v.id("tasks")),
    title: v.string(),
    content: v.string(),
    type: documentTypeValidator,
  },
  handler: async (ctx, args) => {
    // Get agent info
    const agent = await ctx.db.get(args.agentId);
    if (!agent) {
      throw new Error("Not found: Agent does not exist");
    }
    
    const now = Date.now();
    
    if (args.documentId) {
      // Update existing document
      const document = await ctx.db.get(args.documentId);
      if (!document) {
        throw new Error("Not found: Document does not exist");
      }
      
      if (document.accountId !== agent.accountId) {
        throw new Error("Forbidden: Document belongs to different account");
      }
      
      const versionIncrement = args.content !== document.content;
      
      await ctx.db.patch(args.documentId, {
        title: args.title,
        content: args.content,
        type: args.type,
        taskId: args.taskId,
        version: versionIncrement ? document.version + 1 : document.version,
        updatedAt: now,
      });
      
      // Log activity
      await logActivity({
        ctx,
        accountId: agent.accountId,
        type: "document_updated",
        actorType: "agent",
        actorId: args.agentId,
        actorName: agent.name,
        targetType: "document",
        targetId: args.documentId,
        targetName: args.title,
        meta: { 
          versionIncrement,
          newVersion: versionIncrement ? document.version + 1 : document.version,
        },
      });
      
      return args.documentId;
    } else {
      // Create new document
      const documentId = await ctx.db.insert("documents", {
        accountId: agent.accountId,
        taskId: args.taskId,
        title: args.title,
        content: args.content,
        type: args.type,
        authorType: "agent",
        authorId: args.agentId,
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
      
      // Log activity
      await logActivity({
        ctx,
        accountId: agent.accountId,
        type: "document_created",
        actorType: "agent",
        actorId: args.agentId,
        actorName: agent.name,
        targetType: "document",
        targetId: documentId,
        targetName: args.title,
        meta: { type: args.type, taskId: args.taskId },
      });
      
      return documentId;
    }
  },
});
```

### Step 3: Verify Build

```bash
cd packages/backend
npx convex dev --once
npm run typecheck
```

### Step 4: Commit Changes

```bash
git add .
git commit -m "feat(documents): implement document management

- Add document CRUD operations
- Support document types: deliverable, note, template, reference
- Add task linking/unlinking
- Add version tracking
- Add document search
- Add service function for agent document creation
"
```

---

## 6. Edge Cases & Risks

### Edge Cases

| Case | Handling |
|------|----------|
| Link to invalid task | Validate task exists and same account |
| Search empty query | Return all documents |
| Duplicate document | Create with "(Copy)" suffix |
| Content unchanged | Don't increment version |

---

## 7. Testing Strategy

### Manual Verification

- [ ] Create document
- [ ] Update document (verify version increment)
- [ ] Link document to task
- [ ] Search by title
- [ ] Duplicate document
- [ ] Delete document

---

## 8. Rollout / Migration

Not applicable for initial implementation.

---

## 9. TODO Checklist

### Main Module

- [ ] Create `documents.ts`
- [ ] Implement `list` query
- [ ] Implement `listByType` query
- [ ] Implement `listByTask` query
- [ ] Implement `get` query
- [ ] Implement `search` query
- [ ] Implement `create` mutation
- [ ] Implement `update` mutation
- [ ] Implement `linkToTask` mutation
- [ ] Implement `remove` mutation
- [ ] Implement `duplicate` mutation

### Service Module

- [ ] Create `service/documents.ts`
- [ ] Implement `createOrUpdateFromAgent`

### Verification

- [ ] Type check passes
- [ ] Test document CRUD
- [ ] Commit changes

---

## Completion Criteria

This module is complete when:

1. All document queries and mutations implemented
2. Version tracking works correctly
3. Task linking works
4. Search functionality works
5. Type check passes
6. Git commit made
