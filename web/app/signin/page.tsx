import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions, isAllowedEmail } from "@/lib/auth";
import SignInClient from "./SignInClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function normalizeCallbackUrl(value: string | string[] | undefined) {
  const candidate = firstParam(value);
  if (!candidate) return "/today";
  if (!candidate.startsWith("/")) return "/today";
  if (candidate.startsWith("//")) return "/today";
  if (candidate === "/signin") return "/today";
  return candidate;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase();
  const callbackUrl = normalizeCallbackUrl(searchParams?.callbackUrl);
  const error = firstParam(searchParams?.error) || null;
  const reconnectGoogle = firstParam(searchParams?.reconnect) === "google";

  if (email && isAllowedEmail(email) && !reconnectGoogle) {
    redirect(callbackUrl);
  }

  return (
    <SignInClient
      callbackUrl={callbackUrl}
      error={error}
      reconnectGoogle={reconnectGoogle}
    />
  );
}
