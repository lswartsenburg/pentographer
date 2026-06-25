"use client";

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";

export function SessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <NextAuthSessionProvider>{children}</NextAuthSessionProvider>
    </ThemeProvider>
  );
}
