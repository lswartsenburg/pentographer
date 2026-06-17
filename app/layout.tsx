import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pentographer — Security Audit Platform",
  description: "AI-assisted cybersecurity audit reporting platform",
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
