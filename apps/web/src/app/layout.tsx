import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { cn } from "@packages/ui/lib/utils";
import "@packages/ui/src/styles/globals.css";
import ConvexClientProvider from "./ConvexClientProvider";
import { Toaster } from "sonner";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Mission Control",
  description: "Multi-agent coordination dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={cn(inter.className)}>
        <ConvexClientProvider>
          {children}
          <Toaster />
        </ConvexClientProvider>
      </body>
    </html>
  );
}
