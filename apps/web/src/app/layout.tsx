import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { cn } from "@packages/ui/lib/utils";
import "@packages/ui/styles/globals.css";
import ConvexClientProvider from "@/components/providers/ConvexClientProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { CommandPaletteProvider } from "@/components/providers/CommandPaletteProvider";
import { Toaster } from "sonner";
import { SkipLink } from "@/components/ui/SkipLink";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "OpenClaw Mission Control",
  description: "Multi-agent coordination dashboard",
};

/**
 * Root layout: fonts, Clerk + Convex + theme providers, skip link, toaster, and main content wrapper.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          geistSans.variable,
          geistMono.variable,
          "font-sans antialiased",
        )}
        suppressHydrationWarning
      >
        <ErrorBoundary variant="page">
          <ClerkProvider>
            <ThemeProvider>
              <ConvexClientProvider>
                <SkipLink />
                <CommandPaletteProvider />
                <div id="main-content">{children}</div>
                <Toaster
                  position="bottom-right"
                  toastOptions={{
                    className: "font-sans",
                    style: {
                      borderRadius: "0.625rem",
                    },
                  }}
                />
              </ConvexClientProvider>
            </ThemeProvider>
          </ClerkProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
