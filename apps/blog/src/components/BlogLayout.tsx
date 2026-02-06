import Link from "next/link";

export function BlogHeader() {
  return (
    <header className="border-b border-gray-200 py-12 mb-12">
      <div className="max-w-4xl mx-auto px-4">
        <Link href="/" className="text-gray-600 hover:text-gray-900 mb-4 inline-block">
          ← Back to blog
        </Link>
        <h1 className="text-5xl font-bold mb-4">OpenClaw Blog</h1>
        <p className="text-xl text-gray-600">
          Insights, tutorials, and updates about OpenClaw Mission Control
        </p>
      </div>
    </header>
  );
}

export function BlogFooter() {
  return (
    <footer className="border-t border-gray-200 py-12 mt-16">
      <div className="max-w-4xl mx-auto px-4 text-center text-gray-600">
        <p>© 2026 OpenClaw. Built with Next.js, MDX, and ❤️</p>
      </div>
    </footer>
  );
}

interface PostLayoutProps {
  children: React.ReactNode;
  className?: string;
}

export function PostLayout({ children, className = "" }: PostLayoutProps) {
  return (
    <div className={`prose prose-lg max-w-3xl mx-auto py-8 ${className}`}>
      {children}
    </div>
  );
}
