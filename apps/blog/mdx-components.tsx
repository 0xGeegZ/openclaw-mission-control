import React from "react";

/** Map of MDX element names to React components. Used by @next/mdx. */
export type MDXComponents = Record<
  string,
  React.ComponentType<Record<string, unknown>>
>;

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h1: ({ children }: { children?: React.ReactNode }) => (
      <h1 className="text-4xl font-bold my-6 mt-8 scroll-m-20">{children}</h1>
    ),
    h2: ({ children }: { children?: React.ReactNode }) => (
      <h2 className="text-3xl font-semibold my-5 mt-8 scroll-m-20">
        {children}
      </h2>
    ),
    h3: ({ children }: { children?: React.ReactNode }) => (
      <h3 className="text-2xl font-semibold my-4 mt-6 scroll-m-20">
        {children}
      </h3>
    ),
    h4: ({ children }: { children?: React.ReactNode }) => (
      <h4 className="text-xl font-semibold my-3 mt-4 scroll-m-20">
        {children}
      </h4>
    ),
    p: ({ children }: { children?: React.ReactNode }) => (
      <p className="my-3 leading-7">{children}</p>
    ),
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
      <a
        href={href ?? "#"}
        className="text-blue-600 hover:underline dark:text-blue-400"
      >
        {children}
      </a>
    ),
    ul: ({ children }: { children?: React.ReactNode }) => (
      <ul className="list-disc list-inside my-4 space-y-2">{children}</ul>
    ),
    ol: ({ children }: { children?: React.ReactNode }) => (
      <ol className="list-decimal list-inside my-4 space-y-2">{children}</ol>
    ),
    li: ({ children }: { children?: React.ReactNode }) => (
      <li className="ml-4">{children}</li>
    ),
    blockquote: ({ children }: { children?: React.ReactNode }) => (
      <blockquote className="border-l-4 border-gray-300 pl-4 my-4 italic text-gray-700 dark:text-gray-400">
        {children}
      </blockquote>
    ),
    code: ({
      children,
      className,
    }: {
      children?: React.ReactNode;
      className?: string;
    }) => (
      <code
        className={`bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-sm font-mono ${
          className ?? ""
        }`}
      >
        {children}
      </code>
    ),
    pre: ({ children }: { children?: React.ReactNode }) => (
      <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-auto my-4 text-sm">
        {children}
      </pre>
    ),
    table: ({ children }: { children?: React.ReactNode }) => (
      <div className="overflow-x-auto my-4">
        <table className="w-full border-collapse border border-gray-300">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }: { children?: React.ReactNode }) => (
      <thead className="bg-gray-200 dark:bg-gray-800">{children}</thead>
    ),
    tbody: ({ children }: { children?: React.ReactNode }) => (
      <tbody>{children}</tbody>
    ),
    tr: ({ children }: { children?: React.ReactNode }) => (
      <tr className="border border-gray-300">{children}</tr>
    ),
    th: ({ children }: { children?: React.ReactNode }) => (
      <th className="text-left px-4 py-2 font-semibold">{children}</th>
    ),
    td: ({ children }: { children?: React.ReactNode }) => (
      <td className="px-4 py-2">{children}</td>
    ),
    img: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
      <img
        {...props}
        alt={props.alt ?? ""}
        className="max-w-full h-auto rounded-lg my-4"
      />
    ),
    hr: () => <hr className="my-6 border-gray-300" />,
    ...components,
  };
}
