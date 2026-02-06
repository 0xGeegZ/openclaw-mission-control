import type { Metadata } from "next";
import { getPostBySlug, getPostSlugs } from "@/lib/posts";
import { notFound } from "next/navigation";
import Link from "next/link";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = await getPostSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);

  if (!post) {
    return {
      title: "Post not found | OpenClaw Blog",
    };
  }

  return {
    title: `${post.metadata.title} | OpenClaw Blog`,
    description: post.metadata.excerpt || post.metadata.title,
    authors: [{ name: post.metadata.author }],
    keywords: post.metadata.tags,
    openGraph: {
      type: "article",
      title: post.metadata.title,
      description: post.metadata.excerpt,
      authors: [post.metadata.author],
      publishedTime: post.metadata.date,
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const publishDate = new Date(post.metadata.date).toLocaleDateString(
    "en-US",
    {
      year: "numeric",
      month: "long",
      day: "numeric",
    }
  );

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link
          href="/"
          className="text-blue-600 hover:underline mb-8 inline-block font-semibold"
        >
          ← Back to blog
        </Link>

        <article className="prose prose-lg max-w-none">
          <header className="mb-8 pb-8 border-b border-gray-200">
            <h1 className="text-5xl font-bold mb-4">{post.metadata.title}</h1>

            <div className="flex items-center gap-2 text-gray-600 mb-4">
              <time dateTime={post.metadata.date}>{publishDate}</time>
              <span>•</span>
              <span>by {post.metadata.author}</span>
            </div>

            {post.metadata.excerpt && (
              <p className="text-lg text-gray-700 italic">
                {post.metadata.excerpt}
              </p>
            )}

            {post.metadata.tags.length > 0 && (
              <div className="flex gap-2 flex-wrap mt-4">
                {post.metadata.tags.map((tag) => (
                  <span
                    key={tag}
                    className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </header>

          {/* MDX content is injected here by Next.js */}
          <div className="my-8">{/* Content from MDX file */}</div>
        </article>

        <footer className="mt-12 pt-8 border-t border-gray-200 text-gray-600">
          <p>
            Questions? Join our{" "}
            <a
              href="https://discord.com/invite/clawd"
              className="text-blue-600 hover:underline"
            >
              community Discord
            </a>
            .
          </p>
        </footer>
      </div>
    </div>
  );
}
