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
 * Get a specific blog post by slug
 */
export async function getPostBySlug(slug: string): Promise<Post | null> {
  const filePath = path.join(postsDirectory, `${slug}.mdx`);

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
  } catch {
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
