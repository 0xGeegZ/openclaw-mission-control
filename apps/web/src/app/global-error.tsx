"use client";

import { AlertTriangle, RefreshCw, Home } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center bg-background">
          <div className="relative mb-6">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-red-100 dark:bg-red-900/20">
              <AlertTriangle className="h-10 w-10 text-red-600 dark:text-red-400" />
            </div>
          </div>
          
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Application Error
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 max-w-md leading-relaxed">
            A critical error occurred. Please try refreshing the page or return to the home page.
          </p>

          <div className="flex items-center gap-3 mt-6">
            <a
              href="/"
              className="inline-flex items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <Home className="h-4 w-4 mr-2" />
              Go Home
            </a>
            <button
              onClick={reset}
              className="inline-flex items-center justify-center rounded-lg bg-gray-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </button>
          </div>

          {error.digest && (
            <p className="mt-6 text-xs text-gray-500 dark:text-gray-500">
              Error ID: <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-mono">{error.digest}</code>
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
