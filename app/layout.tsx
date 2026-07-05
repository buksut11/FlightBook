import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { CursorEffect } from "@/components/cursor-effect";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Flight Booking",
  description: "Internal flight ticket booking system",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
          <CursorEffect />
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
