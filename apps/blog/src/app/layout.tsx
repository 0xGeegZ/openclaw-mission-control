import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
  title: "OpenClaw Blog",
  description: "Insights, tutorials, and updates about OpenClaw Mission Control",
  metadataBase: new URL("http://localhost:3000"),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-white text-gray-900">
        {children}
      </body>
    </html>
  );
}
