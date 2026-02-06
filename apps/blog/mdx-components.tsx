import type { MDXComponents } from "mdx/types";
import React from "react";

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h1: ({ children }) => (
      <h1 className="text-4xl font-bold my-6 mt-8 scroll-m-20">{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 className="text-3xl font-semibold my-5 mt-8 scroll-m-20">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-2xl font-semibold my-4 mt-6 scroll-m-20">
        {children}
      </h3>
    ),
    h4: ({ children }) => (
      <h4 className="text-xl font-semibold my-3 mt-4 scroll-m-20">
        {children}
      </h4>
    ),
    p: ({ children }) => <p className="my-3 leading-7">{children}</p>,
    a: ({ href, children }) => (
      <a
        href={href as string}
        className="text-blue-600 hover:underline dark:text-blue-400"
      >
        {children}
      </a>
    ),
    ul: ({ children }) => (
      <ul className="list-disc list-inside my-4 space-y-2">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="list-decimal list-inside my-4 space-y-2">{children}</ol>
    ),
    li: ({ children }) => <li className="ml-4">{children}</li>,
    blockquote: ({ children }) => (
      <blockquote className="border-l-4 border-gray-300 pl-4 my-4 italic text-gray-700 dark:text-gray-400">
        {children}
      </blockquote>
    ),
    code: ({ children, className }) => (
      <code
        className={`bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-sm font-mono ${
          className || ""
        }`}
      >
        {children}
      </code>
    ),
    pre: ({ children }) => (
      <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-auto my-4 text-sm">
        {children}
      </pre>
    ),
    table: ({ children }) => (
      <div className="overflow-x-auto my-4">
        <table className="w-full border-collapse border border-gray-300">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className="bg-gray-200 dark:bg-gray-800">{children}</thead>
    ),
    tbody: ({ children }) => <tbody>{children}</tbody>,
    tr: ({ children }) => (
      <tr className="border border-gray-300">{children}</tr>
    ),
    th: ({ children }) => (
      <th className="text-left px-4 py-2 font-semibold">{children}</th>
    ),
    td: ({ children }) => <td className="px-4 py-2">{children}</td>,
    img: (props) => (
      <img
        {...props}
        alt={props.alt || ""}
        className="max-w-full h-auto rounded-lg my-4"
      />
    ),
    hr: () => <hr className="my-6 border-gray-300" />,
    ...components,
  };
}
