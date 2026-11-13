import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Festie Ads", template: "%s | Festie Ads" },
  description: "Ads for your festie fests.",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = { themeColor: "#f3f4f6" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body className="min-h-svh bg-shell text-foreground antialiased">{children}</body>
    </html>
  );
}
