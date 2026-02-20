# @apps/blog

## 1.0.0

### Major Changes

- 8bbd99b: **V1 — OpenClaw Blog**

  First stable release of the OpenClaw marketing/engineering blog: a Next.js app that serves MDX-based posts with static generation, SEO metadata, and a minimal reading experience.

  **Content model**
  - Posts live in `src/content/posts` as `.mdx` files. Frontmatter (parsed with gray-matter): `title`, `date`, `author`, `tags` (array), optional `excerpt`. Slug is derived from the filename (no extension). `getPosts()` returns all posts as metadata list, sorted by date descending. `getPostBySlug(slug)` returns full post (metadata + raw content) for a single slug. `getPostSlugs()` returns all slugs for static path generation.

  **Security**
  - Slug validation: only alphanumeric, hyphen, underscore allowed; invalid slugs rejected before filesystem access. Path traversal protection: resolved path must be under the posts directory; otherwise the request is blocked and null is returned. No user-supplied paths used for reads.

  **Routes**
  - **/** — Blog index. Fetches posts via `getPosts()`, renders a grid of `BlogCard` components (title, excerpt, date, author, tags, link to post). Uses `BlogHeader` and `BlogFooter`. Empty state when there are no posts.
  - **/[slug]** — Single post. `generateStaticParams()` from `getPostSlugs()` for static generation. `generateMetadata()`: title (post title + "| OpenClaw Blog"), description (excerpt or title), authors, keywords, openGraph (article type, publishedTime). Post layout: back link to blog, article with title, date, author, optional excerpt, tags as pills, content area (MDX rendered by Next.js), footer with Discord CTA.

  **Components and styling**
  - `BlogCard` — Summary card for index. `BlogHeader` / `BlogFooter` — Consistent chrome and links. Styling: white background, max-width container (3xl for post, 4xl for index), prose for article content, tag pills (blue), clear typography and spacing.

  **Build and runtime**
  - Next.js App Router; static/SSG for index and all known slugs. No backend or database; content is version-controlled MDX. Suitable for product announcements, engineering deep-dives, and getting-started content. Ready to add more posts under `src/content/posts` without code changes.

  **Tests**
  - `posts.test.ts` covers slug validation, path traversal protection, and getPosts/getPostBySlug behavior.

  This release marks the blog as production-ready for the first stable deployment (1.0.0).
