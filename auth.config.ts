import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;

      // API routes handle their own auth — let them through
      if (nextUrl.pathname.startsWith("/api/")) {
        return true;
      }

      // Public well-known endpoints (OAuth discovery, etc.)
      if (nextUrl.pathname.startsWith("/.well-known/")) {
        return true;
      }

      // Public pages accessible to everyone regardless of auth state
      if (nextUrl.pathname.startsWith("/security")) {
        return true;
      }

      const isAuthPage =
        nextUrl.pathname.startsWith("/login") || nextUrl.pathname.startsWith("/register");

      if (isAuthPage) {
        if (isLoggedIn) {
          return Response.redirect(new URL("/dashboard", nextUrl));
        }
        return true;
      }

      if (!isLoggedIn) {
        return Response.redirect(new URL("/login", nextUrl));
      }

      return true;
    },
  },
  providers: [],
};
