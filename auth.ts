import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { userAccount } from "@/db/schema";
import { authConfig } from "./auth.config";

if (!process.env.AUTH_SECRET && !process.env.NEXTAUTH_SECRET) {
  throw new Error(
    "AUTH_SECRET (or NEXTAUTH_SECRET) environment variable is required. Generate one with: openssl rand -base64 32"
  );
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        const [user] = await db
          .select()
          .from(userAccount)
          .where(eq(userAccount.email, email.toLowerCase()))
          .limit(1);

        if (!user) return null;

        const passwordMatch = await compare(password, user.passwordHash);
        if (!passwordMatch) return null;

        return { id: user.id, name: user.name, email: user.email };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger, session }) {
      if (trigger === "update" && (session as { orgId?: string } | null)?.orgId) {
        token.orgId = (session as { orgId: string }).orgId;
      }
      if (user) {
        token.id = user.id;
      }
      // Fetch orgId on sign-in or when missing from an existing token (legacy sessions)
      if (user || (token.id && !token.orgId)) {
        const userId = (user?.id ?? token.id) as string;
        const [row] = await db
          .select({ orgId: userAccount.personalOrgId })
          .from(userAccount)
          .where(eq(userAccount.id, userId))
          .limit(1);
        token.orgId = row?.orgId ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.id) {
        session.user.id = token.id as string;
      }
      if (token.orgId) {
        session.user.orgId = token.orgId as string;
      }
      return session;
    },
  },
});
