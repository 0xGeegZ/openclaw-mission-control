# OpenClaw Blog

A markdown-based blog built with Next.js, MDX, and Tailwind CSS.

## Features

- 📝 **Markdown & MDX Support** — Write content in markdown with JSX components
- 🎨 **Beautiful Syntax Highlighting** — Code blocks with Shiki theme
- 📋 **YAML Frontmatter** — Metadata (title, date, tags, author) extracted with gray-matter
- ⚡ **Static Generation** — All posts pre-rendered at build time for maximum performance
- 🎯 **Type-Safe** — Full TypeScript support with strict types
- 📱 **Responsive Design** — Mobile-friendly with Tailwind CSS
- 🔍 **SEO Ready** — Metadata API integration for search engines

## Quick Start

### Prerequisites

- Node.js >= 24.0.0
- npm >= 11.0.0

### Installation

```bash
# From the monorepo root
npm install

# Start development
npm run dev
```

Blog will be available at `http://localhost:3000/blog` (depending on your dev setup).

### Build

```bash
npm run build
npm run start
```

## Creating Blog Posts

Create a new file in `src/content/posts/your-post-slug.mdx`:

```mdx
---
title: Your Post Title
date: 2026-02-06
author: Your Name
tags: [tag1, tag2, tag3]
excerpt: A brief description of your post
---

# Your Post Title

Your markdown content here...

## Code Example

\`\`\`typescript
const hello = (name: string) => {
  console.log(`Hello, ${name}!`);
};
\`\`\`

## Features

- GitHub Flavored Markdown (tables, strikethrough, etc.)
- JSX components inline
- Beautiful syntax highlighting

## Next Steps

1. Check out the [Getting Started](/getting-started) guide
2. Explore the [Blog Architecture](/markdown-blog-architecture) post
```

### Frontmatter Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | ✓ | Post title |
| `date` | string | ✓ | ISO date (2026-02-06) |
| `author` | string | ✓ | Author name |
| `tags` | string[] | ✓ | Array of tags |
| `excerpt` | string | - | Brief description (shown in list view) |

## Tech Stack

- **Next.js** — React framework with App Router
- **@next/mdx** — MDX support for Next.js
- **gray-matter** — YAML frontmatter parsing
- **remark-gfm** — GitHub Flavored Markdown
- **rehype-pretty-code** — Syntax highlighting with Shiki
- **Tailwind CSS** — Utility-first CSS framework
- **@tailwindcss/typography** — Prose styling plugin

## Structure

```
blog/
├── src/
│   ├── app/
│   │   ├── page.tsx                 # Blog index
│   │   └── [slug]/
│   │       └── page.tsx             # Individual post
│   ├── content/
│   │   └── posts/
│   │       ├── getting-started.mdx
│   │       └── ...
│   ├── lib/
│   │   └── posts.ts                 # Post utilities
│   ├── components/
│   │   ├── BlogCard.tsx
│   │   └── BlogLayout.tsx
│   └── globals.css                  # Global styles
├── mdx-components.tsx               # Global MDX components
├── next.config.ts                   # Next.js config with MDX
└── package.json
```

## Development

### Adding a Post

1. Create `src/content/posts/my-post.mdx`
2. Add frontmatter with metadata
3. Write your content
4. Posts appear automatically on the blog index

### Customizing Components

Edit `mdx-components.tsx` to customize how markdown renders:

```typescript
export function useMDXComponents(components: MDXComponents) {
  return {
    h1: ({ children }) => <h1 className="text-5xl">{children}</h1>,
    // ... other elements
  };
}
```

### Styling

Tailwind CSS is configured with the typography plugin:

- Edit `tailwind.config.ts` to customize theme
- Edit `src/globals.css` for global styles
- Use `prose` classes for markdown content styling

## Performance

- **Build Time:** O(n) where n = number of posts
- **Static Generation:** Zero-latency page loads (pre-rendered)
- **Bundle Size:** ~50KB gzipped (MDX compiler)
- **Incremental Builds:** Only changed posts rebuild

## SEO

Post metadata is automatically converted to meta tags:

- Title, description, keywords
- Open Graph (og:title, og:description, etc.)
- Author information
- Published date

## Future Enhancements

- [ ] RSS feed generation
- [ ] Full-text search
- [ ] Related posts sidebar
- [ ] Comment system (Convex integration)
- [ ] Analytics integration
- [ ] Dark mode support

## Contributing

1. Create a new post in `src/content/posts/`
2. Follow the frontmatter format
3. Test locally: `npm run dev`
4. Build: `npm run build`
5. Submit a PR

## License

Same as OpenClaw Mission Control

## Resources

- [Next.js MDX Documentation](https://nextjs.org/docs/app/guides/mdx)
- [gray-matter](https://github.com/jonschlinkert/gray-matter)
- [Tailwind CSS Typography](https://tailwindcss.com/docs/plugins#typography)
- [Shiki Syntax Highlighter](https://shiki.style)
