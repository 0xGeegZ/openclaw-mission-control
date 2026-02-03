import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { cn } from "@packages/ui/lib/utils";
import "@packages/ui/styles/globals.css";
import ConvexClientProvider from "@/components/providers/ConvexClientProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { Toaster } from "sonner";

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(geistSans.variable, geistMono.variable, "font-sans antialiased")}
        suppressHydrationWarning
      >
        <ClerkProvider>
          <ThemeProvider>
            <ConvexClientProvider>
              {children}
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
      </body>
    </html>
  );
}
