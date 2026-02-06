import type { Metadata } from "next";
import { getPosts } from "@/lib/posts";
import { BlogCard } from "@/components/BlogCard";
import { BlogHeader, BlogFooter } from "@/components/BlogLayout";

export const metadata: Metadata = {
  title: "Blog | OpenClaw",
  description: "Read insights, tutorials, and updates about OpenClaw Mission Control",
};

export default async function BlogPage() {
  const posts = await getPosts();

  return (
    <div className="min-h-screen bg-white">
      <BlogHeader />
      
      <main className="max-w-4xl mx-auto px-4 pb-16">
        {posts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 text-lg">
              No blog posts yet. Check back soon!
            </p>
          </div>
        ) : (
          <div className="grid gap-8">
            {posts.map((post) => (
              <BlogCard key={post.slug} post={post} />
            ))}
          </div>
        )}
      </main>

      <BlogFooter />
    </div>
  );
}
