# OpenClaw Mission Control - Brand & Design Tokens

## Philosophy

Clean, developer-friendly aesthetic inspired by GitHub and Vercel. Focus on clarity, functionality, and honest communication about the product's open-source nature and current capabilities.

---

## Logo

**File**: `/apps/web/public/logo.svg`

The logo depicts interconnected agent nodes (circles) with connection lines—representing the core mission of agent coordination and collaboration. Designed to scale responsively and work in both light and dark modes.

**Usage**:
- Hero section: 64px–80px height
- Navigation: 32px–40px height
- Footer: 24px–32px height

---

## Typography

**Font Stack** (from existing Geist setup):
- **Sans serif (headings, body)**: `Geist` (Next.js Google Font)
- **Monospace (code, technical)**: `Geist Mono`

**Hierarchy**:

| Level | CSS Size | Weight | Use Case |
|-------|----------|--------|----------|
| H1 | 2.5rem (40px) | 600 | Main headline |
| H2 | 1.875rem (30px) | 600 | Section headlines |
| H3 | 1.25rem (20px) | 600 | Subsection titles |
| Body | 1rem (16px) | 400 | Body text |
| Small | 0.875rem (14px) | 400 | Captions, labels |
| Code | 0.875rem (14px) | 400 | Code blocks (monospace) |

**Line height**: 1.6 for readability; 1.4 for code blocks

---

## Color Palette

**Primary Colors**:
- **Deep Charcoal**: `#0f172a` (primary text, headings)
- **Medium Gray**: `#64748b` (secondary text, borders)
- **Light Gray**: `#cbd5e1` (subtle backgrounds, dividers)
- **Very Light Gray**: `#f1f5f9` (section backgrounds)

**Accent Color**:
- **Sky Blue**: `#0ea5e9` (CTAs, highlights, hover states)
- **Darker Blue**: `#0284c7` (CTA hover)

**Semantic Colors**:
- **Success (Green)**: `#10b981`
- **Warning (Amber)**: `#f59e0b`
- **Error (Red)**: `#ef4444`
- **Info (Cyan)**: `#06b6d4`

**Code/Terminal Aesthetic**:
- **Code Background**: `#1e293b` (dark slate)
- **Code Text**: `#e2e8f0` (light gray)
- **Code Accent**: `#38bdf8` (light blue for syntax highlighting)

---

## Spacing Scale

Built on 4px base unit:

| Name | Value | Use |
|------|-------|-----|
| xs | 0.25rem (4px) | Minimal spacing |
| sm | 0.5rem (8px) | Compact spacing |
| md | 1rem (16px) | Standard spacing |
| lg | 1.5rem (24px) | Larger sections |
| xl | 2rem (32px) | Major section separation |
| 2xl | 3rem (48px) | Full section gap |

---

## Components

All components from existing `shadcn/ui` library + custom overrides:

- **Button**: Primary (sky blue), Secondary (gray), Outlined
- **Card**: White background, subtle shadow, rounded corners (8px)
- **Input/Form**: Standard form elements with accessible focus states
- **Code Block**: Dark background, light text, monospace font
- **Accordion**: Smooth expand/collapse animation (prefer reduced-motion support)
- **Badge/Tag**: Semantic colors (success, warning, error, info)

---

## Accessibility

- **WCAG 2.1 AA** compliance minimum
- **Color contrast**: All text meets 4.5:1 contrast ratio (normal text), 3:1 (large text)
- **Focus states**: Visible blue outline (2px, 2px offset)
- **Reduced motion**: Respect `prefers-reduced-motion: reduce` (no animations)
- **Semantic HTML**: Use `<button>`, `<nav>`, `<main>`, etc.
- **Alt text**: All images and icons have descriptive alt text
- **Keyboard navigation**: Full keyboard support, logical tab order

---

## Responsive Design

**Breakpoints** (mobile-first):
- Mobile: 320px–768px
- Tablet: 768px–1024px
- Desktop: 1024px+

**Key principles**:
- Single-column layout on mobile (stacked)
- Hero section scales responsively (padding, font sizes)
- Code blocks use horizontal scroll on mobile
- Footer is single-column on mobile, multi-column on desktop

---

## Animation & Motion

**Principles**:
- Minimal, purposeful animations
- Respect `prefers-reduced-motion` media query
- Transitions: 200ms ease-in-out for hover/focus
- No autoplay animations on page load

**Uses**:
- Button hover: Subtle background color shift (200ms)
- Accordion expand: Smooth height transition (250ms)
- Code block copy: Toast notification slide-in (300ms)

---

## Dark Mode (Future Enhancement)

Currently light-only. If dark mode is added:
- Invert text/background colors
- Maintain 4.5:1 contrast ratio
- Adjust code block colors for dark background
- Use darker accent colors for better visibility

**Dark mode variables** already defined in `BRAND_COLORS.css` for future use.

---

## Implementation Notes for @engineer

1. **Fonts**: Already set up via `Geist` + `Geist_Mono` in `layout.tsx`
2. **Colors**: Import from `BRAND_COLORS.css` or convert to Tailwind config variables
3. **Components**: Use existing `shadcn/ui` components (Button, Card, Accordion)
4. **Logo**: Reference `/public/logo.svg` in navigation + hero
5. **Spacing**: Use Tailwind scale (sm, md, lg, xl) mapped to 4px base unit
6. **Responsive**: Use Tailwind breakpoints (`md:`, `lg:`)
7. **Accessibility**: Test with axe DevTools, WAVE, or similar
8. **Reduced motion**: Wrap animations with `@media (prefers-reduced-motion: no-preference)`

---

**Design System Status**: Ready for implementation  
**Last Updated**: 2026-02-07  
**Created by**: Designer (UI/UX)
