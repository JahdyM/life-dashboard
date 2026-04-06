import { cache } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions, isAllowedEmail } from "@/lib/auth";

export const getOptionalPageEmail = cache(async () => {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase();

  if (!email || !isAllowedEmail(email)) {
    return null;
  }

  return email;
});

export const getAuthenticatedPageEmail = cache(async () => {
  const email = await getOptionalPageEmail();
  if (!email) {
    redirect("/signin");
  }

  return email;
});
