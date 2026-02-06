import Link from "next/link";
import type { PostMetadata } from "@/lib/posts";

interface BlogCardProps {
  post: PostMetadata;
}

export function BlogCard({ post }: BlogCardProps) {
  const publishDate = new Date(post.date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <article className="border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
      <Link href={`/${post.slug}`} className="block group">
        <h2 className="text-2xl font-bold mb-2 group-hover:text-blue-600 transition-colors">
          {post.title}
        </h2>
      </Link>

      <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
        <time dateTime={post.date}>{publishDate}</time>
        <span>•</span>
        <span>by {post.author}</span>
      </div>

      {post.excerpt && (
        <p className="text-gray-700 mb-4 line-clamp-2">{post.excerpt}</p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {post.tags.map((tag) => (
          <span
            key={tag}
            className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-medium"
          >
            #{tag}
          </span>
        ))}
      </div>

      <Link
        href={`/${post.slug}`}
        className="inline-block mt-4 text-blue-600 hover:underline font-semibold"
      >
        Read more →
      </Link>
    </article>
  );
}
