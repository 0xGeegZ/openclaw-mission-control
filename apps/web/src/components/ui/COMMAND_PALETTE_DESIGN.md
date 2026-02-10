# Command Palette Design Documentation

## Overview

The Command Palette is a keyboard-driven interface (Cmd+K / Ctrl+K) for fast navigation, task creation, and agent selection in Mission Control. It provides a central hub for power users to execute actions without leaving their current context.

## Aesthetic Direction

**Style**: Minimalist, Premium, Command-Line Inspired  
**Mood**: Focused, Efficient, Sophisticated  
**Inspiration**: VS Code Command Palette, Spotlight (macOS), Linear's Interface

### Visual Principles

- **Dark, cohesive theme** with minimal visual noise
- **Luminescent accents** (electric blue) that guide focus
- **Monospace typography** for system-level authenticity
- **Smooth micro-interactions** that feel responsive and intentional
- **High contrast** for accessibility and clarity
- **Negative space** that creates breathing room and emphasizes content

### Color Palette

| Role | Token | Usage |
|------|-------|-------|
| Primary Background | `--cp-bg-primary` | Modal background (#0f0f0f) |
| Secondary Background | `--cp-bg-secondary` | Hover states, secondary elements (#1a1a1a) |
| Tertiary Background | `--cp-bg-tertiary` | Accents, badges (#252525) |
| Border | `--cp-border` | Dividers, input borders (#333333) |
| Text Primary | `--cp-text-primary` | Main copy (#e8e8e8) |
| Text Secondary | `--cp-text-secondary` | Descriptions, hints (#a0a0a0) |
| Accent | `--cp-accent` | Focus, selection, highlights (#3b82f6) |
| Accent Hover | `--cp-accent-hover` | Interactive hover state (#2563eb) |

## Component Structure

### CommandPalette.tsx

**Props:**
- `onTaskCreate?` - Callback when "New Task" is selected
- `onNavigate?` - Navigation handler for task/doc/agent links
- `tasks?` - Array of task objects {id, title}
- `docs?` - Array of doc objects {id, title}
- `agents?` - Array of agent objects {id, name}

**Features:**
1. **Keyboard Activation** - Cmd+K / Ctrl+K toggles open/close
2. **Intelligent Search** - Filters by title, description, keywords
3. **Keyboard Navigation** - Arrow keys to navigate, Enter to select, Escape to close
4. **Category Labels** - Visual categorization (task, doc, agent, action, setting)
5. **Responsive Design** - Works on mobile and desktop

### CommandItem Interface

```typescript
interface CommandItem {
  id: string;                           // Unique identifier
  title: string;                        // Display name
  category: 'action' | 'task' | 'doc' | 'agent' | 'setting';
  description?: string;                 // Short description
  icon: React.ReactNode;               // Lucide icon
  action: () => void;                  // Callback when selected
  keywords?: string[];                 // Additional search terms
}
```

## Interaction Patterns

### Opening
- User presses **Cmd+K** or **Ctrl+K**
- Modal slides down with smooth animation (0.2s cubic-bezier)
- Overlay fades in (0.15s)
- Input automatically focused

### Searching
- Type to filter results by:
  - Item title
  - Item description
  - Custom keywords
- Results update in real-time

### Navigation
- **Arrow Up/Down** - Move selection
- **Enter** - Execute selected command
- **Escape** - Close palette

### Selection Feedback
- Hover or keyboard selection highlights item with blue accent
- Category badge updates color on selection
- Icon changes color to match accent

## Usage Example

```tsx
import CommandPalette from '@/components/ui/CommandPalette';

export default function App() {
  const tasks = [
    { id: '123', title: 'Implement dashboard' },
    { id: '456', title: 'Fix auth bug' },
  ];

  const docs = [
    { id: 'doc1', title: 'Architecture Guide' },
  ];

  const agents = [
    { id: 'agent1', name: 'Designer' },
    { id: 'agent2', name: 'Engineer' },
  ];

  return (
    <CommandPalette
      tasks={tasks}
      docs={docs}
      agents={agents}
      onTaskCreate={() => {
        // Open new task modal
      }}
      onNavigate={(path) => {
        // Router.push(path)
      }}
    />
  );
}
```

## Accessibility

- **Keyboard-first design** - All actions accessible via keyboard
- **ARIA labels** - Dialog role, proper semantic HTML
- **High contrast** - Text meets WCAG AA standards
- **Focus visible** - Clear visual indication of keyboard focus
- **Escape hatch** - Always closable with Escape key

## Performance Considerations

- **Memoization** - `useMemo` for command items and filtered results
- **Lazy rendering** - Only visible list items rendered initially
- **CSS modules** - Style encapsulation, no global pollution
- **Event delegation** - Single listener for keyboard shortcuts

## Future Enhancements

1. **Recent items** - Show frequently/recently used commands
2. **Grouped categories** - Organize results by type
3. **Custom themes** - Light/dark mode support
4. **Command history** - Remember user's command patterns
5. **Rich previews** - Show task details on hover
6. **Integrations** - Connect to external services (Slack, etc.)

## Customization

### Theming

Update CSS variables in `:root`:

```css
:root {
  --cp-accent: #your-color;
  --cp-bg-primary: #your-dark-color;
  /* ... */
}
```

### Animation

Adjust animations in `.modal` and `.container`:

```css
.container {
  animation: slideDown 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
```

## Browser Support

- Modern browsers with CSS Grid, Flexbox, Backdrop Filter
- Graceful degradation on older browsers
- Mobile-optimized with touch considerations

## Quality Checklist

- ✅ Visual hierarchy clear and intentional
- ✅ Accessibility basics covered (keyboard, contrast, focus)
- ✅ Performance optimized (memoization, event handling)
- ✅ Responsive design for mobile and desktop
- ✅ Distinctive aesthetic with no generic AI slop
- ✅ Consistent with existing design system
