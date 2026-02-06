import { promises as fs } from "fs";
import path from "path";
import matter from "gray-matter";

export interface PostMetadata {
  title: string;
  date: string;
  author: string;
  tags: string[];
  excerpt?: string;
  slug: string;
}

export interface Post {
  metadata: PostMetadata;
  content: string;
}

const postsDirectory = path.join(process.cwd(), "src/content/posts");

/**
 * Validate slug contains only safe characters (alphanumeric, hyphens, underscores).
 * Prevents path traversal attacks.
 */
function isValidSlug(slug: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(slug);
}

/**
 * Get all blog posts sorted by date (newest first)
 */
export async function getPosts(): Promise<PostMetadata[]> {
  const files = await fs.readdir(postsDirectory);
  const posts: PostMetadata[] = [];

  for (const file of files) {
    if (!file.endsWith(".mdx")) continue;

    const filePath = path.join(postsDirectory, file);
    const content = await fs.readFile(filePath, "utf-8");
    const { data } = matter(content);

    posts.push({
      title: data.title || "Untitled",
      date: data.date || new Date().toISOString(),
      author: data.author || "Unknown",
      tags: data.tags || [],
      excerpt: data.excerpt,
      slug: file.replace(/\.mdx$/, ""),
    });
  }

  // Sort by date descending (newest first)
  return posts.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

/**
 * Get a specific blog post by slug.
 * Includes path traversal protection and slug validation.
 */
export async function getPostBySlug(slug: string): Promise<Post | null> {
  // Security: Reject invalid slugs immediately (prevents path traversal)
  if (!isValidSlug(slug)) {
    console.warn(`[Blog Security] Invalid slug rejected: "${slug}"`);
    return null;
  }

  const filePath = path.join(postsDirectory, `${slug}.mdx`);
  
  // Security: Ensure resolved path is within postsDirectory
  const resolvedPath = path.resolve(filePath);
  const resolvedBase = path.resolve(postsDirectory);
  
  if (!resolvedPath.startsWith(resolvedBase + path.sep)) {
    console.warn(`[Blog Security] Path traversal blocked: "${slug}" resolved to "${resolvedPath}"`);
    return null; // Path traversal attempt blocked
  }

  try {
    const content = await fs.readFile(filePath, "utf-8");
    const { data } = matter(content);

    return {
      metadata: {
        title: data.title || "Untitled",
        date: data.date || new Date().toISOString(),
        author: data.author || "Unknown",
        tags: data.tags || [],
        excerpt: data.excerpt,
        slug,
      },
      content,
    };
  } catch (error) {
    // Log error for debugging but return null (404 will be handled by caller)
    if (error instanceof Error && !error.message.includes("ENOENT")) {
      console.error(`[Blog] Error loading post "${slug}":`, error.message);
    }
    return null;
  }
}

/**
 * Get all available blog post slugs (for generateStaticParams)
 */
export async function getPostSlugs(): Promise<string[]> {
  const files = await fs.readdir(postsDirectory);
  return files
    .filter((file) => file.endsWith(".mdx"))
    .map((file) => file.replace(/\.mdx$/, ""));
}
