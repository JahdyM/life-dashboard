import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "./db/prisma";
import { encryptToken } from "./encryption";
import { allowedEmails, env } from "./env";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope:
            "openid email profile https://www.googleapis.com/auth/calendar",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user, account }) {
      const email = user.email?.toLowerCase();
      if (!email || (allowedEmails.length > 0 && !allowedEmails.includes(email))) {
        return false;
      }
      if (account && account.provider === "google") {
        try {
          const refresh = account.refresh_token;
          const access = account.access_token;
          const expiresAt = account.expires_at
            ? new Date(account.expires_at * 1000).toISOString()
            : null;
          if (refresh || access) {
            const nowIso = new Date().toISOString();
            const existing = await prisma.googleCalendarToken.findUnique({
              where: { userEmail: email },
            });
            const refreshEnc = refresh
              ? encryptToken(refresh)
              : existing?.refreshTokenEnc || "";
            await prisma.googleCalendarToken.upsert({
              where: { userEmail: email },
              update: {
                refreshTokenEnc: refreshEnc,
                accessToken: access || existing?.accessToken || null,
                expiresAt: expiresAt || existing?.expiresAt || null,
                scope: account.scope || existing?.scope || null,
                updatedAt: nowIso,
              },
              create: {
                userEmail: email,
                refreshTokenEnc: refreshEnc,
                accessToken: access || null,
                expiresAt: expiresAt || null,
                scope: account.scope || null,
                updatedAt: nowIso,
              },
            });
          }
        } catch (_err) {
          return true;
        }
      }
      return true;
    },
    async jwt({ token, account, user }) {
      if (account) {
        token.accessToken = account.access_token;
      }
      if (user?.email) {
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (token?.email) {
        session.user = session.user || { name: null, email: null, image: null };
        session.user.email = String(token.email);
      }
      if (token?.accessToken) {
        (session as any).accessToken = token.accessToken;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) {
        return url === "/signin" ? `${baseUrl}/` : `${baseUrl}${url}`;
      }
      try {
        const parsed = new URL(url);
        if (parsed.origin === baseUrl) {
          return parsed.pathname === "/signin" ? `${baseUrl}/` : url;
        }
      } catch (_err) {
        return baseUrl;
      }
      return baseUrl;
    },
  },
  pages: {
    signIn: "/signin",
  },
};

export function isAllowedEmail(email?: string | null): boolean {
  if (!email) return false;
  return allowedEmails.includes(email.toLowerCase());
}
