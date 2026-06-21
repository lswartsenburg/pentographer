import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pentographer - Security Audit Platform",
  description: "AI-assisted cybersecurity audit reporting platform",
  icons: {
    icon: [
      {
        url: "/favicons/light/favicon-32x32.png",
        sizes: "32x32",
        type: "image/png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/favicons/light/favicon-16x16.png",
        sizes: "16x16",
        type: "image/png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/favicons/dark/favicon-32x32.png",
        sizes: "32x32",
        type: "image/png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/favicons/dark/favicon-16x16.png",
        sizes: "16x16",
        type: "image/png",
        media: "(prefers-color-scheme: dark)",
      },
    ],
    shortcut: "/favicons/light/favicon.ico",
    apple: [
      { url: "/favicons/light/apple-touch-icon.png", media: "(prefers-color-scheme: light)" },
      { url: "/favicons/dark/apple-touch-icon.png", media: "(prefers-color-scheme: dark)" },
    ],
    other: [{ rel: "manifest", url: "/site.webmanifest" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col antialiased">{children}</body>
    </html>
  );
}
