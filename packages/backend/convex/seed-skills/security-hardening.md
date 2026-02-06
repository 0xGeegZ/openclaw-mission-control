---
name: security-hardening
description: OWASP security patterns, input validation, CSRF/XSS prevention, authentication, and secure defaults
---

# Security Hardening

## Overview

Build secure systems by implementing OWASP best practices, input validation, authentication, and authorization patterns. This skill covers defense-in-depth strategies and secure coding practices.

**Use this skill when:**
- Building APIs and web applications
- Implementing user authentication
- Handling sensitive data
- Designing authorization logic
- Reviewing code for security vulnerabilities

## OWASP Top 10 (2023)

### 1. Broken Access Control

**Risk:** Users access resources they shouldn't (horizontal/vertical escalation)

**Prevention:**
```typescript
// ❌ Wrong - trusts client
GET /api/users/123
// Client can change ID and access other users

// ✅ Right - verify ownership
async function getUserData(userId: string, requestingUser: string) {
  if (userId !== requestingUser) {
    throw new UnauthorizedError('Cannot access other user data');
  }
  return getUser(userId);
}
```

### 2. Cryptographic Failures

**Risk:** Exposure of sensitive data (passwords, tokens, API keys)

**Prevention:**
```typescript
// ❌ Wrong - hardcoded secrets
const apiKey = "sk_live_abc123def456";

// ✅ Right - environment variables
const apiKey = process.env.STRIPE_API_KEY;

// Hash passwords, never store plaintext
import bcrypt from 'bcrypt';
const hash = await bcrypt.hash(password, 10);
const isValid = await bcrypt.compare(password, hash);

// Use HTTPS only (no HTTP)
// Encrypt data at rest in databases
```

### 3. Injection

**Risk:** Attacker injects malicious code (SQL, NoSQL, command injection)

**Prevention:**
```typescript
// ❌ Wrong - string concatenation
const query = `SELECT * FROM users WHERE id = ${userId}`;

// ✅ Right - parameterized queries
const user = db.query('SELECT * FROM users WHERE id = ?', [userId]);

// ❌ Wrong - eval with user input
eval(userInput);

// ✅ Right - use template engines safely
const template = Handlebars.compile(templateString);
const output = template(safeData);

// Validate and sanitize all inputs
import validator from 'validator';
const email = validator.normalizeEmail(userInput);
```

### 4. Insecure Design

**Risk:** Missing security requirements in architecture

**Prevention:**
- Implement authentication/authorization upfront
- Use role-based access control (RBAC)
- Encrypt sensitive data
- Log security events
- Rate limiting on sensitive endpoints

### 5. Security Misconfiguration

**Risk:** Default credentials, unnecessary services, outdated dependencies

**Prevention:**
```bash
# ✅ Keep dependencies updated
npm audit
npm update

# ❌ Don't expose debug info in production
console.error(error);  // May leak stack traces

# ✅ Custom error messages
return { error: 'Invalid credentials' };  // No details

# Disable X-Powered-By header
app.disable('x-powered-by');

# Use Content Security Policy
app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy", "default-src 'self'");
  next();
});
```

### 6. Vulnerable & Outdated Components

**Risk:** Using libraries with known vulnerabilities

**Prevention:**
```bash
# Regular scanning
npm audit
npm audit fix

# Check before adding dependencies
npx snyk test

# Pin versions
npm install --save-exact lodash@4.17.21

# Remove unused dependencies
npm prune
```

### 7. Authentication Failures

**Risk:** Weak password policies, session management issues

**Prevention:**
```typescript
// Strong password requirements
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/;
if (!passwordRegex.test(password)) {
  throw new Error('Password must be 12+ chars with uppercase, lowercase, number, symbol');
}

// Secure session management
// Use secure cookies
response.setHeader('Set-Cookie', [
  'sessionId=abc123; HttpOnly; Secure; SameSite=Strict; Path=/',
]);

// Implement MFA for critical operations
// Session timeout for inactivity
// Never expose session IDs in URLs
```

### 8. Software and Data Integrity Failures

**Risk:** Untrusted updates, vulnerable dependencies

**Prevention:**
- Verify signatures of software updates
- Use HTTPS for all downloads
- Pin dependency versions
- Code signing for releases

### 9. Logging & Monitoring Failures

**Risk:** Not detecting security incidents

**Prevention:**
```typescript
// Log security events
logger.info('Failed login attempt', {
  email: userEmail,
  ip: request.ip,
  timestamp: new Date(),
});

// Monitor for suspicious patterns
// Alert on multiple failed auth attempts
// Track sensitive data access
```

### 10. SSRF (Server-Side Request Forgery)

**Risk:** Attacker makes server perform unintended requests

**Prevention:**
```typescript
// ❌ Wrong - trusts user URL
const response = await fetch(userProvidedUrl);

// ✅ Right - whitelist domains
const allowedDomains = ['api.example.com', 'data.example.com'];
const url = new URL(userProvidedUrl);
if (!allowedDomains.includes(url.hostname)) {
  throw new Error('URL not allowed');
}
const response = await fetch(userProvidedUrl);
```

## Common Vulnerabilities

### Cross-Site Scripting (XSS)

**Stored XSS Example:**
```typescript
// ❌ Wrong - stored user input rendered as HTML
const userComment = "<img src=x onerror='alert(1)'>";
res.send(`<p>${userComment}</p>`);

// ✅ Right - escape HTML
const escaped = sanitizeHtml(userComment);
res.send(`<p>${escaped}</p>`);

// Or use template engines with auto-escaping
res.render('comment', { comment: userComment });
```

### Cross-Site Request Forgery (CSRF)

**Prevention:**
```typescript
// CSRF token in forms
<form method="POST" action="/update-email">
  <input type="hidden" name="csrfToken" value="<%= csrfToken %>">
  <input type="email" name="email">
</form>

// Verify token on submission
app.post('/update-email', (req, res) => {
  if (!verifyCsrfToken(req.body.csrfToken, req.session)) {
    return res.status(403).send('Invalid CSRF token');
  }
  // Process request
});

// SameSite cookies as defense layer
res.setHeader('Set-Cookie', 'sessionId=abc; SameSite=Strict');
```

### Broken Authentication

```typescript
// ✅ Good password handling
const hash = await bcrypt.hash(password, 10);
await db.users.update({ id: userId }, { passwordHash: hash });

// ✅ Session security
const sessionToken = crypto.randomBytes(32).toString('hex');
await db.sessions.create({ token: sessionToken, userId, expiresAt: futureDate });

// ✅ Never expose sensitive data
return { id: user.id, email: user.email };  // No password hash!

// Implement rate limiting on login
limiter.limit('login', userEmail, 5);  // Max 5 attempts per hour
```

## Input Validation Strategy

```typescript
// 1. Whitelist allowed values
const allowedRoles = ['admin', 'user', 'guest'];
if (!allowedRoles.includes(userRole)) {
  throw new Error('Invalid role');
}

// 2. Validate data types
if (typeof age !== 'number' || age < 0 || age > 150) {
  throw new Error('Invalid age');
}

// 3. Limit string length
if (email.length > 255) {
  throw new Error('Email too long');
}

// 4. Use schema validation
import { z } from 'zod';
const userSchema = z.object({
  email: z.string().email(),
  age: z.number().min(0).max(150),
  role: z.enum(['admin', 'user', 'guest']),
});
const validated = userSchema.parse(userInput);
```

## Security Checklist

- [ ] All data inputs validated and sanitized
- [ ] Sensitive data encrypted (passwords, API keys, PII)
- [ ] HTTPS enforced, no HTTP
- [ ] CORS properly configured
- [ ] Rate limiting on sensitive endpoints
- [ ] Authentication and authorization implemented
- [ ] Security headers set (CSP, X-Frame-Options, etc.)
- [ ] Error messages don't leak sensitive info
- [ ] Dependencies scanned for vulnerabilities
- [ ] Security logs captured and monitored
- [ ] Secrets not in version control (.env in .gitignore)
- [ ] CSRF protection enabled
- [ ] XSS protection (template auto-escape or sanitization)
- [ ] SQL injection prevention (parameterized queries)

## Related Skills

- @backend-convex - Implement secure Convex queries
- @api-design - Design secure APIs
- @test-automation - Test security with automated tests
- @production-ready-refactor - Refactor for security
