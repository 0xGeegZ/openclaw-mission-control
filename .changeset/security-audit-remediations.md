---
"web-app": patch
"@packages/backend": patch
---

Security audit remediations: message content max length (100k), user message attachment validation from storage metadata, Next.js security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy), and root npm override for esbuild (>=0.25.0).
