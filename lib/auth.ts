import NextAuth, { DefaultSession } from "next-auth";
import GitHub from "next-auth/providers/github";

import { PrismaAdapter } from "@auth/prisma-adapter";

import prisma from "@/lib/prisma";
import { encrypt } from "@/lib/encryption";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      image: string;
      role: "USER" | "ADMIN";
      plan: "FREE" | "PRO";
    } & DefaultSession["user"];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID!,
      clientSecret: process.env.AUTH_GITHUB_SECRET!,
      authorization: {
        params: {
          // Request repo scope to clone private repos
          scope: "read:user user:email repo",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      // Store encrypted GitHub token and GitHub username for later use
      if (account?.access_token && user.id) {
        try {
          const encryptedToken = encrypt(account.access_token);
          const githubUsername =
            (profile as Record<string, unknown> | undefined)?.login as
              | string
              | undefined;
          await prisma.user.update({
            where: { id: user.id },
            data: {
              encryptedGithubToken: encryptedToken,
              ...(githubUsername && { githubUsername }),
            },
          });
        } catch (error) {
          console.error("Failed to store GitHub token:", error);
        }
      }

      return true;
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { role: true, plan: true },
        });
        if (dbUser) {
          session.user.role = dbUser.role;
          session.user.plan = dbUser.plan;
        }
      }
      return session;
    },
  },
});
