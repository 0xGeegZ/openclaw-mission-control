import type { Metadata } from "next";
import { DM_Sans, Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { cn } from "@packages/ui/lib/utils";
import "@packages/ui/styles/globals.css";
import ConvexClientProvider from "@/components/providers/ConvexClientProvider";
import { Toaster } from "sonner";

const dmSans = DM_Sans({ 
  subsets: ["latin"],
  variable: "--font-sans",
});

const inter = Inter({ 
  subsets: ["latin"],
  variable: "--font-body",
});

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
      <body className={cn(dmSans.variable, inter.variable, "font-sans")}>
        <ClerkProvider>
          <ConvexClientProvider>
            {children}
            <Toaster 
              position="bottom-right"
              toastOptions={{
                className: "font-sans",
                style: {
                  borderRadius: "0.75rem",
                },
              }}
            />
          </ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
