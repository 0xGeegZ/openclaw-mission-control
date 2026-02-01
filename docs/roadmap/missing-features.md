# Mission Control - Missing Features & Backend Requirements

This document outlines the frontend pages that have been scaffolded and require backend implementation.

## Pages Status Overview

| Page | Route | Frontend | Backend |
|------|-------|----------|---------|
| Tasks | `/{accountSlug}/tasks` | Complete | Complete |
| Task Detail | `/{accountSlug}/tasks/{taskId}` | Complete | Complete |
| Agents | `/{accountSlug}/agents` | Complete | Complete |
| Feed | `/{accountSlug}/feed` | Complete | Complete |
| Documents | `/{accountSlug}/docs` | Scaffolded | Missing |
| Settings | `/{accountSlug}/settings` | Scaffolded | Missing |
| Notifications | `/{accountSlug}/notifications` | Scaffolded | Partial |

---

## 1. Documents Page (`/{accountSlug}/docs`)

### Frontend Status
- Grid/list view toggle implemented
- Search input ready
- Empty state and loading states designed
- File/folder display structure ready

### Backend Requirements

#### Convex Functions Needed

```typescript
// convex/documents.ts

// List all documents for an account
export const list = query({
  args: {
    accountId: v.id("accounts"),
    folderId: v.optional(v.id("documents")), // for nested folders
    searchQuery: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Return documents with: _id, name, type ("file" | "folder"), 
    // parentId, createdAt, updatedAt, createdBy, size, mimeType
  },
});

// Create a new document
export const create = mutation({
  args: {
    accountId: v.id("accounts"),
    name: v.string(),
    type: v.union(v.literal("file"), v.literal("folder")),
    parentId: v.optional(v.id("documents")),
    content: v.optional(v.string()), // for text documents
  },
  handler: async (ctx, args) => {
    // Create document record
  },
});

// Update document
export const update = mutation({
  args: {
    documentId: v.id("documents"),
    name: v.optional(v.string()),
    content: v.optional(v.string()),
    parentId: v.optional(v.id("documents")),
  },
  handler: async (ctx, args) => {
    // Update document
  },
});

// Delete document
export const remove = mutation({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    // Soft or hard delete
  },
});

// Get single document
export const get = query({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    // Return full document with content
  },
});
```

#### Schema Addition

```typescript
// In convex/schema.ts

documents: defineTable({
  accountId: v.id("accounts"),
  name: v.string(),
  type: v.union(v.literal("file"), v.literal("folder")),
  parentId: v.optional(v.id("documents")),
  content: v.optional(v.string()),
  mimeType: v.optional(v.string()),
  size: v.optional(v.number()),
  createdBy: v.string(), // Clerk user ID
  updatedBy: v.optional(v.string()),
})
  .index("by_account", ["accountId"])
  .index("by_parent", ["accountId", "parentId"]),
```

### Future Enhancements
- File uploads (using Convex file storage)
- Real-time collaborative editing
- Version history
- File sharing with external users
- Document templates

---

## 2. Settings Page (`/{accountSlug}/settings`)

### Frontend Status
- Tabbed interface with 5 sections:
  - General (workspace name, slug)
  - Members (team management)
  - Notifications (preferences)
  - Appearance (theme)
  - Billing (subscription)

### Backend Requirements

#### Convex Functions Needed

```typescript
// convex/accounts.ts - Add/Update these functions

// Update account settings
export const update = mutation({
  args: {
    accountId: v.id("accounts"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    settings: v.optional(v.object({
      theme: v.optional(v.string()),
      notificationPreferences: v.optional(v.object({
        taskUpdates: v.boolean(),
        agentActivity: v.boolean(),
        emailDigest: v.boolean(),
      })),
    })),
  },
  handler: async (ctx, args) => {
    // Validate slug uniqueness if changed
    // Update account
  },
});

// Delete account (danger zone)
export const remove = mutation({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    // Verify owner permissions
    // Cascade delete all related data
    // - tasks
    // - agents
    // - documents
    // - activities
    // - notifications
    // - memberships
  },
});
```

#### Team Members Module

```typescript
// convex/members.ts

export const list = query({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    // Return members with roles
  },
});

export const invite = mutation({
  args: {
    accountId: v.id("accounts"),
    email: v.string(),
    role: v.union(v.literal("admin"), v.literal("member"), v.literal("viewer")),
  },
  handler: async (ctx, args) => {
    // Create invitation record
    // Send invitation email (via action)
  },
});

export const updateRole = mutation({
  args: {
    membershipId: v.id("memberships"),
    role: v.string(),
  },
  handler: async (ctx, args) => {
    // Update member role
  },
});

export const remove = mutation({
  args: {
    membershipId: v.id("memberships"),
  },
  handler: async (ctx, args) => {
    // Remove member from workspace
  },
});
```

#### Schema Additions

```typescript
// In convex/schema.ts

// Add settings to accounts table
accounts: defineTable({
  // ... existing fields
  settings: v.optional(v.object({
    theme: v.optional(v.string()),
    notificationPreferences: v.optional(v.object({
      taskUpdates: v.boolean(),
      agentActivity: v.boolean(),
      emailDigest: v.boolean(),
    })),
  })),
}),

// Add invitations table
invitations: defineTable({
  accountId: v.id("accounts"),
  email: v.string(),
  role: v.string(),
  invitedBy: v.string(),
  status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("expired")),
  expiresAt: v.number(),
})
  .index("by_account", ["accountId"])
  .index("by_email", ["email"]),
```

---

## 3. Notifications Page (`/{accountSlug}/notifications`)

### Frontend Status
- Full notifications list with filtering
- Mark as read functionality
- Mark all as read button
- Different notification types with icons

### Backend Requirements

#### Update Existing Functions

```typescript
// convex/notifications.ts

// Already exists: getUnreadCount - Verify it works

// Add: List all notifications (paginated)
export const list = query({
  args: {
    accountId: v.id("accounts"),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()), // for pagination
    filter: v.optional(v.union(v.literal("all"), v.literal("unread"))),
  },
  handler: async (ctx, args) => {
    // Return notifications with:
    // _id, title, message, type, isRead, _creationTime
  },
});

// Mark single notification as read
export const markAsRead = mutation({
  args: {
    notificationId: v.id("notifications"),
  },
  handler: async (ctx, args) => {
    // Set isRead to true
  },
});

// Mark all as read
export const markAllAsRead = mutation({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    // Batch update all unread notifications
  },
});

// Create notification (internal use)
export const create = internalMutation({
  args: {
    accountId: v.id("accounts"),
    userId: v.string(),
    type: v.string(), // "task_assigned" | "task_completed" | "agent_message" | etc.
    title: v.string(),
    message: v.string(),
    metadata: v.optional(v.any()), // taskId, agentId, etc.
  },
  handler: async (ctx, args) => {
    // Create notification record
  },
});
```

#### Schema Verification

```typescript
// Ensure notifications table exists
notifications: defineTable({
  accountId: v.id("accounts"),
  userId: v.string(), // Recipient
  type: v.string(),
  title: v.string(),
  message: v.string(),
  isRead: v.boolean(),
  metadata: v.optional(v.any()),
})
  .index("by_account_user", ["accountId", "userId"])
  .index("by_unread", ["accountId", "userId", "isRead"]),
```

### Notification Triggers
These places should create notifications:
1. Task assigned to user
2. Task completed
3. Agent sends message
4. New member joins workspace
5. System alerts (errors, important updates)

---

## 4. Additional Missing Features

### User Profile Page
- Route: `/{accountSlug}/profile` or `/profile`
- Features: Edit profile, change password, manage sessions

### Search Functionality
- Global search across tasks, documents, agents
- Route: `/{accountSlug}/search?q=...`

### Agent Detail Page
- Route: `/{accountSlug}/agents/{agentId}`
- Features: Agent configuration, history, statistics

### Analytics Dashboard
- Route: `/{accountSlug}/analytics`
- Features: Task metrics, agent performance, team activity

---

## Priority Order for Implementation

1. **High Priority**
   - Notifications backend (partial exists, complete it)
   - Settings - General tab (workspace update)
   
2. **Medium Priority**
   - Documents module
   - Settings - Members tab
   - Notification triggers throughout the app

3. **Lower Priority**
   - Settings - Appearance (theme)
   - Settings - Billing
   - Analytics dashboard
   - Global search

---

## Notes for Backend Developer

- All mutations should include proper authorization checks
- Use Convex's built-in real-time capabilities for live updates
- Consider implementing soft deletes for important data
- Add activity logging for audit trails
- Implement proper error handling with meaningful messages
