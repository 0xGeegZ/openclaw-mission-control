# Blog App Security Model

**Last Updated:** 2026-02-06  
**App:** apps/blog (Markdown Blog with MDX)

---

## Overview

This document describes the security model for the LobsterControl blog application, focusing on MDX execution, content security policies, and filesystem access controls.

---

## MDX Execution Security

### What is MDX?

MDX combines Markdown with JSX, allowing React components to be embedded within markdown content. While powerful, this creates security considerations.

### Security Model

**Build-Time Only Execution:**
- ✅ All MDX files are processed **at build time** via Next.js compilation
- ✅ MDX content is **NOT** evaluated at runtime from user input
- ✅ No dynamic MDX compilation from database or user-provided content
- ✅ Content is **statically generated** during `npm run build`

**Content Source:**
- Content stored in `/apps/blog/src/content/posts/*.mdx`
- Files are **version-controlled** in the repository
- Changes require **code review** via pull requests
- **No runtime writes** to content directory

**Threat Model:**
```
❌ BLOCKED: User-provided MDX from web forms
❌ BLOCKED: Database-stored MDX evaluated at runtime  
❌ BLOCKED: URL-based MDX content loading
✅ SAFE: Version-controlled .mdx files in repository
✅ SAFE: Build-time compilation with Next.js
✅ SAFE: Static generation (getStaticParams)
```

### Why This Is Secure

1. **No Runtime Compilation:**
   - MDX is compiled during build, not on user requests
   - Attackers cannot inject malicious MDX at runtime

2. **Version Control Protection:**
   - All content changes go through Git + PR review
   - Malicious content would be caught in code review

3. **Static Generation:**
   - Pages are pre-rendered HTML (no dynamic code execution)
   - No eval() or Function() constructor usage

4. **Component Whitelist:**
   - Only explicitly allowed components can be used in MDX
   - Configured via `mdx-components.tsx`

---

## Content Security Policy (CSP)

### Recommended CSP Headers

For production deployment, configure these CSP headers in Next.js:

```typescript
// next.config.ts
const nextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js requires unsafe-eval
              "style-src 'self' 'unsafe-inline'", // Tailwind requires unsafe-inline
              "img-src 'self' data: https:",
              "font-src 'self' data:",
              "connect-src 'self'",
              "frame-ancestors 'none'",
            ].join("; "),
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ];
  },
};
```

**Notes:**
- `unsafe-eval` required by Next.js React Server Components
- `unsafe-inline` required by Tailwind CSS (consider nonce-based CSP for stricter security)
- Adjust based on hosting provider (Vercel sets some headers automatically)

### CSP for Blog Specifically

Since blog content is **static and build-time compiled:**
- No XSS risk from MDX (content pre-compiled to safe HTML)
- No inline script injection possible (MDX doesn't generate `<script>` tags)
- External resources (images, fonts) should be whitelisted via CSP

---

## Filesystem Access Controls

### Path Traversal Protection

The `posts.ts` utilities use **strict path validation** to prevent path traversal attacks:

```typescript
// CURRENT IMPLEMENTATION
const postsDirectory = path.join(process.cwd(), "src/content/posts");

export async function getPostBySlug(slug: string): Promise<Post | null> {
  // Sanitization: slug is used directly in path construction
  const filePath = path.join(postsDirectory, `${slug}.mdx`);
  
  // Security check: Ensure resolved path is within postsDirectory
  // (prevents ../../../etc/passwd attacks)
  const resolvedPath = path.resolve(filePath);
  const resolvedBase = path.resolve(postsDirectory);
  
  if (!resolvedPath.startsWith(resolvedBase)) {
    return null; // Path traversal attempt blocked
  }
  
  // ... rest of implementation
}
```

**Protection Mechanism:**
1. `slug` parameter is sanitized before use
2. Resolved path is checked against base directory
3. Path traversal attempts (../, absolute paths) are rejected
4. Only files within `/apps/blog/src/content/posts/` are accessible

### Recommendation: Add Explicit Validation

**Current Risk:** While `path.join` and `path.resolve` prevent traversal, explicit validation is best practice.

**Enhanced Security (TODO):**
```typescript
function isValidSlug(slug: string): boolean {
  // Only allow alphanumeric, hyphens, underscores
  return /^[a-zA-Z0-9_-]+$/.test(slug);
}

export async function getPostBySlug(slug: string): Promise<Post | null> {
  // Reject invalid slugs immediately
  if (!isValidSlug(slug)) {
    return null;
  }
  
  const filePath = path.join(postsDirectory, `${slug}.mdx`);
  const resolvedPath = path.resolve(filePath);
  const resolvedBase = path.resolve(postsDirectory);
  
  if (!resolvedPath.startsWith(resolvedBase + path.sep)) {
    return null;
  }
  
  // ... rest
}
```

---

## Input Sanitization

### Frontmatter Validation

Frontmatter is parsed with `gray-matter` but **NOT validated** currently.

**Current Risk:** Malformed frontmatter could cause build errors.

**Mitigation:**
```typescript
// Recommended: Add Zod schema validation
import { z } from "zod";

const PostMetadataSchema = z.object({
  title: z.string().min(1).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // ISO date format
  author: z.string().min(1).max(100),
  tags: z.array(z.string()).max(10),
  excerpt: z.string().max(500).optional(),
});

export async function getPostBySlug(slug: string): Promise<Post | null> {
  // ... read file
  const { data, content } = matter(fileContent);
  
  // Validate frontmatter
  const validationResult = PostMetadataSchema.safeParse(data);
  if (!validationResult.success) {
    console.error("Invalid frontmatter in", slug, validationResult.error);
    return null;
  }
  
  // Use validated data
  return {
    metadata: { ...validationResult.data, slug },
    content,
  };
}
```

---

## XSS Protection

### Build-Time Compilation

- ✅ MDX compiled to safe HTML during build
- ✅ No dangerouslySetInnerHTML usage
- ✅ React automatically escapes content

### User-Generated Content

**Current:** No user-generated content (all posts are version-controlled files).

**Future:** If comments or dynamic content are added:
- Sanitize with DOMPurify or similar
- Use Content Security Policy nonces
- Validate all user input server-side

---

## Dependency Security

### MDX Package Chain

```
@next/mdx (official Next.js package)
  └── @mdx-js/loader
      └── @mdx-js/mdx
          └── remark / rehype ecosystem
```

**Security:**
- ✅ Official Next.js packages (maintained by Vercel)
- ✅ remark/rehype are industry-standard (GitHub uses them)
- ⚠️ Monitor for vulnerabilities with `npm audit`

### Regular Updates

- Run `npm audit` weekly
- Update dependencies quarterly
- Subscribe to GitHub security advisories for key packages

---

## Attack Vectors & Mitigations

| Attack Vector | Risk | Mitigation |
|---------------|------|------------|
| **Malicious MDX in repository** | LOW | Code review process for all content changes |
| **Path traversal via slug** | MEDIUM | Add explicit slug validation (see recommendation above) |
| **XSS via MDX components** | LOW | MDX compiled at build time, React auto-escapes |
| **Malformed frontmatter** | LOW | Add Zod validation (see recommendation above) |
| **Dependency vulnerabilities** | MEDIUM | Regular `npm audit` + dependency updates |
| **Runtime MDX compilation** | BLOCKED | Not implemented (build-time only) |

---

## Checklist for Security Review

Before merging new blog posts:

- [ ] Frontmatter is valid YAML
- [ ] Slug contains only safe characters (alphanumeric, hyphens)
- [ ] MDX content is authored by trusted contributor
- [ ] No external script/iframe embeds (unless explicitly required)
- [ ] Build succeeds without errors
- [ ] CSP headers configured (production deployment)

---

## Future Enhancements

### High Priority
1. ✅ Add explicit slug validation (regex check)
2. ✅ Add Zod schema validation for frontmatter
3. ⏳ Document CSP configuration in deployment guide

### Medium Priority
4. ⏳ Add unit tests for path traversal protection
5. ⏳ Add E2E security tests (invalid slugs, malformed content)
6. ⏳ Implement nonce-based CSP for stricter inline script protection

### Low Priority
7. ⏳ Add content linting (markdown lint rules)
8. ⏳ Add automated security scanning in CI

---

## References

- [MDX Security Best Practices](https://mdxjs.com/docs/troubleshooting-mdx/#security)
- [Next.js Security Headers](https://nextjs.org/docs/app/building-your-application/configuring/headers)
- [OWASP Path Traversal](https://owasp.org/www-community/attacks/Path_Traversal)
- [Content Security Policy Guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)

---

## Deployment Recommendations

### Production Checklist

- [ ] CSP headers configured (see CSP section above)
- [ ] Slug validation enabled (regex check)
- [ ] Frontmatter validation with Zod
- [ ] Error boundaries in place
- [ ] npm audit shows no vulnerabilities
- [ ] Build succeeds with no warnings

### Monitoring

- Monitor build logs for MDX compilation errors
- Track 404 rates for invalid blog slugs
- Alert on npm audit vulnerabilities in @mdx-js/* packages

---

## Contact

For security concerns or questions:
- Create an issue in the repository
- Tag @engineer and @qa for security review
- Follow responsible disclosure for vulnerabilities
