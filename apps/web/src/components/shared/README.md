# Shared Component Library

## Overview

The shared component library consolidates frequently duplicated patterns into reusable, type-safe components. This library is the foundation for consistent UI patterns across the OpenClaw web app.

**Status**: Phase 1 (Dialogs & Cards)
**Total LOC Savings**: ~340-350 LOC across the codebase
**Target**: Reduce technical debt, improve consistency, speed up feature development

---

## Components

### ConfirmDeleteDialog<T>

Generic confirmation dialog for delete operations. Replaces repetitive delete confirmation patterns with a single, reusable component.

**Replaces**:
- `AgentDeleteDialog` (67 LOC)
- `DeleteTaskDialog` (68 LOC)
- Future: Document delete, custom item delete dialogs

**Features**:
- Type-safe generic component (`<ConfirmDeleteDialog<Agent>>`)
- Async operation handling with loading state
- Error message display
- Customizable button labels
- Item name context display

**Usage**:
```tsx
'use client';

import { ConfirmDeleteDialog } from '@/components/shared';
import { useState } from 'react';

export function AgentCard({ agent }: { agent: Agent }) {
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <button onClick={() => setDeleteOpen(true)}>Delete</button>

      <ConfirmDeleteDialog<Agent>
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Agent"
        description="This action cannot be undone. The agent and all associated data will be permanently deleted."
        itemName={agent.name}
        onConfirm={async () => {
          await deleteAgent(agent.id);
        }}
      />
    </>
  );
}
```

**Props**:
| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `open` | `boolean` | Yes | — | Dialog open state |
| `onOpenChange` | `(open: boolean) => void` | Yes | — | Open state callback |
| `title` | `string` | Yes | — | Dialog title |
| `description` | `string` | Yes | — | Warning/description text |
| `itemName` | `string` | Yes | — | Item being deleted (for context) |
| `onConfirm` | `() => Promise<void>` | Yes | — | Async delete handler |
| `actionLabel` | `string` | No | "Delete" | Custom action button text |
| `cancelLabel` | `string` | No | "Cancel" | Custom cancel button text |
| `className` | `string` | No | — | Additional CSS class |

---

### BaseCard + Utilities

Base card component with composition utilities for consistent card styling and layout.

**Replaces**:
- `AgentCard` layout patterns (170 LOC)
- `TaskCard` layout patterns (180 LOC)
- Future: Document cards, feed items, dashboard cards

**Components**:
- `BaseCard` — Root card container with optional interactive/dragging states
- `CardHeader` — Header area (typically avatar + title)
- `CardContent` — Main content area
- `CardFooter` — Footer area (typically badges, actions)
- `CardAvatar` — Avatar with image + initials fallback
- `CardBadge` — Status/role badge with variants
- `CardMetadata` — Metadata row (date, count, state, etc.)

**Usage**:
```tsx
import {
  BaseCard,
  CardHeader,
  CardContent,
  CardFooter,
  CardAvatar,
  CardBadge,
  CardMetadata,
} from '@/components/shared';

export function AgentCard({ agent }: { agent: Agent }) {
  return (
    <BaseCard interactive className="hover:shadow-lg">
      <CardHeader>
        <CardAvatar src={agent.avatar} alt={agent.name} />
        <div className="flex-1">
          <h3 className="font-semibold">{agent.name}</h3>
          <p className="text-sm text-muted-foreground">{agent.role}</p>
        </div>
      </CardHeader>

      <CardContent>
        <p className="text-sm">{agent.description}</p>
        <CardMetadata
          label="Last active"
          value={formatDate(agent.lastActive)}
        />
      </CardContent>

      <CardFooter>
        <CardBadge variant="secondary">{agent.status}</CardBadge>
        <div className="flex gap-2">
          <button>Edit</button>
          <button>Delete</button>
        </div>
      </CardFooter>
    </BaseCard>
  );
}
```

**BaseCard Props**:
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `ReactNode` | — | Card content |
| `className` | `string` | — | Additional CSS class |
| `interactive` | `boolean` | `false` | Add hover effect & cursor |
| `isDragging` | `boolean` | `false` | Visual feedback for drag state |

**CardAvatar Props**:
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `src` | `string?` | — | Image URL |
| `alt` | `string` | — | Alt text (also used for initials) |
| `initials` | `string?` | — | Custom initials (auto-derived from `alt` if not provided) |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Avatar size |
| `className` | `string` | — | Additional CSS class |

**CardBadge Props**:
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `ReactNode` | — | Badge text |
| `variant` | Badge variant | `'default'` | Color variant (`default`, `secondary`, `success`, `destructive`, `warning`) |
| `className` | `string` | — | Additional CSS class |

**CardMetadata Props**:
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string` | — | Metadata label |
| `value` | `ReactNode` | — | Metadata value |
| `icon` | `ReactNode?` | — | Optional icon |
| `className` | `string` | — | Additional CSS class |

---

## Architecture

### Type Safety
All components use TypeScript generics and interfaces for full type safety:
```tsx
// Generic delete dialog is type-safe per item type
<ConfirmDeleteDialog<Agent> ... />
<ConfirmDeleteDialog<Task> ... />
<ConfirmDeleteDialog<Document> ... />
```

### Composition Pattern
Card utilities follow React composition best practices:
```tsx
// Flexible, composable structure
<BaseCard>
  <CardHeader>...</CardHeader>
  <CardContent>...</CardContent>
  <CardFooter>...</CardFooter>
</BaseCard>
```

### Drag & Drop Safe
BaseCard's `isDragging` prop supports drag-and-drop without breaking card structure:
```tsx
<BaseCard isDragging={isDragging} onClick={handleClick}>
  {/* Content remains unaffected by drag state */}
</BaseCard>
```

---

## Migration Guide

### Refactoring Duplicate Dialogs
**Before** (AgentDeleteDialog):
```tsx
// 67 LOC of duplicate delete dialog code
export function AgentDeleteDialog({...}) {
  // AlertDialog setup + state management
  // Error handling
  // Loading state
}
```

**After**:
```tsx
<ConfirmDeleteDialog<Agent>
  open={open}
  onOpenChange={setOpen}
  title="Delete Agent"
  description="..."
  itemName={agent.name}
  onConfirm={async () => await deleteAgent(agent.id)}
/>
```

### Refactoring Card Components
**Before** (AgentCard):
```tsx
// 170 LOC of card layout code
// Manual styling for header, content, footer
// Duplicate avatar logic
// Duplicate badge logic
```

**After**:
```tsx
<BaseCard interactive>
  <CardHeader>
    <CardAvatar src={agent.avatar} alt={agent.name} />
    <h3>{agent.name}</h3>
  </CardHeader>
  <CardContent>
    <p>{agent.description}</p>
  </CardContent>
  <CardFooter>
    <CardBadge>{agent.role}</CardBadge>
  </CardFooter>
</BaseCard>
```

---

## Roadmap

### Phase 1 (Current)
- ✅ ConfirmDeleteDialog<T> generic component
- ✅ BaseCard + card utilities
- ⏳ Refactor AgentDeleteDialog → ConfirmDeleteDialog<Agent>
- ⏳ Refactor DeleteTaskDialog → ConfirmDeleteDialog<Task>
- ⏳ Refactor AgentCard + TaskCard

### Phase 2 (Future)
- Edit/Create dialogs (common patterns)
- Form input components (text, select, textarea, etc.)
- Table/list item templates
- Feed item components

### Phase 3 (Future)
- Modal wrappers
- Drawer components
- Tabs/accordion patterns

---

## Naming Conventions

All new shared components follow these conventions:

1. **Generic components** use PascalCase: `ConfirmDeleteDialog`
2. **Composition utilities** prefix with parent name: `CardHeader`, `CardContent`
3. **Export from index**: All public components via `shared/index.ts`
4. **Type-safe props**: All props interfaces exported and named `<Component>Props`
5. **Documentation**: JSDoc comments on all components and props

---

## Testing

Each shared component includes:
- Unit tests for component rendering
- Props validation tests
- State management tests (where applicable)
- Integration tests with consuming components (during refactor)

See `__tests__/components/shared/` for test suite.

---

## Contributing

When adding new shared components:

1. Ensure the component is used in **3+ places** in the codebase
2. Document via JSDoc + README.md section
3. Export from `shared/index.ts`
4. Add unit tests
5. Create a PR targeting `dev` with title: `feat: Add <ComponentName> to shared library`

---

## See Also

- [Design System Documentation](/docs/design-system.md)
- [Shadcn/UI Components](https://ui.shadcn.com)
- [Component Audit Report](/docs/component-audit.md)
