---
name: accessibility-testing
description: WCAG 2.1 compliance verification, screen reader testing, keyboard navigation, and accessible design patterns
---

# Accessibility Testing

## Overview

Ensure applications are usable by everyone, including users with disabilities. This skill covers WCAG 2.1 compliance, automated testing, and manual verification techniques.

**Use this skill when:**
- Building customer-facing applications
- Meeting legal compliance requirements
- Testing with assistive technologies
- Reviewing UI designs for accessibility
- Improving user experience for all

## WCAG 2.1 Standards

### Accessibility Pyramid

```
Level AAA (Enhanced)
├─ All AA requirements plus additional improvements
├─ Target: Government/large organizations
├─ Examples: Extended color contrast, sign language video

Level AA (Recommended)
├─ Most common target for web applications
├─ Legal requirement in many jurisdictions
├─ Examples: Minimum color contrast 4.5:1, accessible forms

Level A (Minimum)
├─ Basic accessibility
└─ Rarely sufficient for modern applications
```

**Recommendation:** Aim for WCAG 2.1 Level AA compliance.

## Key Accessibility Principles (POUR)

### 1. Perceivable
**Information must be available to the senses**

**Color Contrast:**
```css
/* ❌ Bad: 2.5:1 ratio (fails WCAG AA) */
color: #999;
background-color: #f0f0f0;

/* ✅ Good: 7:1 ratio (exceeds WCAG AAA) */
color: #333;
background-color: #ffffff;
```

**Alternative Text for Images:**
```html
<!-- ❌ Bad: No alt text -->
<img src="dashboard.png">

<!-- ✅ Good: Descriptive alt text -->
<img src="dashboard.png" alt="Sales dashboard showing 15% growth over last quarter">

<!-- ✅ Good: Decorative image (empty alt) -->
<img src="decorative-border.png" alt="">
```

### 2. Operable
**Users must be able to navigate using keyboard**

**Keyboard Navigation:**
```html
<!-- ✅ Good: Proper tab order -->
<form>
  <input type="text" placeholder="Username">
  <input type="password" placeholder="Password">
  <button type="submit">Login</button>
</form>

<!-- ❌ Bad: Hidden focus indicator -->
button { outline: none; }

<!-- ✅ Good: Visible focus -->
button:focus {
  outline: 2px solid #0066cc;
  outline-offset: 2px;
}
```

**Skip Links:**
```html
<!-- Allow keyboard users to skip navigation -->
<body>
  <a href="#main-content" class="skip-link">Skip to main content</a>
  
  <nav><!-- navigation links --></nav>
  
  <main id="main-content">
    <!-- Main content -->
  </main>
</body>

<style>
.skip-link {
  position: absolute;
  left: -9999px;  /* Hidden off-screen */
}

.skip-link:focus {
  left: 0;  /* Visible on focus */
}
</style>
```

### 3. Understandable
**Content must be clear and predictable**

**Readable Text:**
```html
<!-- ❌ Bad: Complex sentence structure, jargon -->
<p>The utilization of our platform engenders a paradigm shift in productivity metrics.</p>

<!-- ✅ Good: Clear, simple language -->
<p>Our platform helps you work faster and more efficiently.</p>
```

**Form Labels:**
```html
<!-- ❌ Bad: No label association -->
Email: <input type="email">

<!-- ✅ Good: Label properly associated -->
<label for="email">Email:</label>
<input type="email" id="email">
```

### 4. Robust
**Content must work with assistive technologies**

**Semantic HTML:**
```html
<!-- ❌ Bad: Using div for everything -->
<div class="button" onclick="submit()">Submit</div>

<!-- ✅ Good: Semantic buttons -->
<button type="submit">Submit</button>

<!-- ❌ Bad: No heading structure -->
<div class="title">Section Title</div>

<!-- ✅ Good: Proper heading hierarchy -->
<h1>Page Title</h1>
<h2>Section Title</h2>
<h3>Subsection</h3>
```

## Automated Testing

### axe DevTools

```bash
npm install --save-dev @axe-core/react
```

```javascript
// React component testing
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

test('should have no accessibility violations', async () => {
  const { container } = render(<MyComponent />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

### Lighthouse Accessibility Audit

```bash
# Generate accessibility report
lighthouse https://example.com --output=json --output-path=./report.json

# Check specific audit
cat report.json | grep -A5 "accessibility"
```

### ESLint Accessibility Plugin

```bash
npm install --save-dev eslint-plugin-jsx-a11y
```

```javascript
// .eslintrc.js
{
  "plugins": ["jsx-a11y"],
  "rules": {
    "jsx-a11y/alt-text": "error",
    "jsx-a11y/label-has-associated-control": "error",
    "jsx-a11y/no-static-element-interactions": "warn"
  }
}
```

## Manual Testing

### Keyboard Navigation Testing

**Test Procedure:**
1. Disable mouse/trackpad
2. Use `Tab` to navigate forward
3. Use `Shift+Tab` to navigate backward
4. Use `Enter` to activate buttons
5. Use `Space` for checkboxes/radio buttons
6. Use arrow keys in menus

**Checklist:**
- [ ] All interactive elements reachable via keyboard
- [ ] Tab order logical and predictable
- [ ] Focus indicator clearly visible
- [ ] No keyboard traps (can't escape with keyboard)
- [ ] Modal dialogs trap focus appropriately

### Screen Reader Testing

**NVDA (Windows, Free):**
```bash
# Download: https://www.nvaccess.org/
# Keyboard: Insert + arrow keys to navigate
```

**JAWS (Windows, Commercial):**
- Industry standard
- More features than NVDA
- ~$90/year for updates

**VoiceOver (macOS/iOS, Free):**
```bash
# Enable: System Preferences → Accessibility → VoiceOver
# Keyboard: Cmd + F5
# Navigation: VO + arrow keys
```

**Test Scenarios:**
- [ ] Page heading announced clearly
- [ ] Form labels associated with inputs
- [ ] Button purposes clear from text
- [ ] Images have meaningful alt text
- [ ] Navigation structure understood
- [ ] Focus order logical

## Color & Contrast

**Color Contrast Checker:**
```bash
npm install --save-dev wcag-contrast
```

**Testing:**
```javascript
import { isLevelAA, isLevelAAA } from 'wcag-contrast';

const foreground = '#333';
const background = '#fff';

console.log(isLevelAA(foreground, background)); // true
console.log(isLevelAAA(foreground, background)); // true
```

**Minimum Ratios:**
- Level A: 3:1 (large text) or 4.5:1 (normal text)
- Level AA: 4.5:1 (normal) or 3:1 (large text)
- Level AAA: 7:1 (normal) or 4.5:1 (large text)

## Accessible Component Patterns

### Accessible Buttons

```tsx
// ✅ Good button implementation
interface ButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  ariaLabel?: string;
}

export function Button({ children, onClick, ariaLabel }: ButtonProps) {
  return (
    <button 
      onClick={onClick}
      aria-label={ariaLabel}
      className="btn"
    >
      {children}
    </button>
  );
}
```

### Accessible Forms

```tsx
// ✅ Good form implementation
export function LoginForm() {
  const [email, setEmail] = React.useState('');
  const [errors, setErrors] = React.useState<string[]>([]);
  const errorId = 'email-error';

  return (
    <form>
      <label htmlFor="email">Email:</label>
      <input
        id="email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-invalid={errors.length > 0}
        aria-describedby={errors.length > 0 ? errorId : undefined}
      />
      {errors.length > 0 && (
        <div id={errorId} role="alert">
          {errors.join(', ')}
        </div>
      )}
      <button type="submit">Login</button>
    </form>
  );
}
```

## Accessibility Checklist

### Design
- [ ] Color contrast meets WCAG AA (4.5:1)
- [ ] No information conveyed by color alone
- [ ] Font size readable (min 14px)
- [ ] Sufficient spacing between clickable elements (min 44px)

### HTML/Markup
- [ ] Semantic HTML used (button, input, etc.)
- [ ] Proper heading hierarchy (h1, h2, h3)
- [ ] Form labels associated with inputs
- [ ] Images have descriptive alt text
- [ ] Links have meaningful text (not "click here")

### Keyboard Navigation
- [ ] All features accessible via keyboard
- [ ] Logical tab order
- [ ] Focus indicator visible
- [ ] No keyboard traps

### Screen Readers
- [ ] Page structure clear
- [ ] Form instructions provided
- [ ] Error messages announced
- [ ] Loading states indicated
- [ ] Modal dialogs properly focused

### Testing
- [ ] Automated tests with axe
- [ ] Lighthouse audit >= 90
- [ ] Keyboard navigation tested
- [ ] Screen reader tested (NVDA or JAWS)

## Common Issues & Fixes

| Issue | Impact | Fix |
|-------|--------|-----|
| Missing alt text | Screen reader users miss images | Add descriptive alt text |
| Poor color contrast | Low vision users can't read | Increase contrast ratio to 4.5:1 |
| No focus indicator | Keyboard users lost | Add visible focus style |
| Form labels missing | Screen reader users confused | Use label elements with htmlFor |
| Click-only interactions | Keyboard users stuck | Add keyboard handlers |

## Resources & Tools

- **WCAG Guidelines:** https://www.w3.org/WAI/WCAG21/quickref/
- **axe DevTools:** https://www.deque.com/axe/devtools/
- **Lighthouse:** Built into Chrome DevTools
- **WebAIM:** https://webaim.org/articles/
- **A11y Project:** https://www.a11yproject.com/

## Related Skills

- @frontend-nextjs - Implement accessible React patterns
- @test-automation - Automate accessibility tests in CI
- @code-review-checklist - Review code for accessibility issues
- @performance-profiling - Monitor performance with screen readers
