import { getServerSession } from "next-auth";
import type { NextRequest } from "next/server";
import { authOptions, isAllowedEmail } from "../auth";
import { verifyApiToken } from "./apiTokens";

/**
 * Resolve the current user's email from a NextAuth session OR an
 * `Authorization: Bearer <token>` header. Pass `request` from API route
 * handlers to enable Bearer auth; without it, only cookie sessions work.
 */
export async function requireUserEmail(request?: NextRequest | Request): Promise<string> {
  if (request) {
    const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
      const token = authHeader.slice(7).trim();
      if (token) {
        const verified = await verifyApiToken(token);
        if (verified) return verified.userEmail;
      }
      // Bearer header was sent but invalid — reject without falling back to cookie
      throw new Error("UNAUTHORIZED");
    }
  }

  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase();
  if (!email || !isAllowedEmail(email)) {
    throw new Error("UNAUTHORIZED");
  }
  return email;
}
