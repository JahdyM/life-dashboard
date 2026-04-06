import { cache } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions, isAllowedEmail } from "@/lib/auth";

export const getAuthenticatedPageEmail = cache(async () => {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase();

  if (!email || !isAllowedEmail(email)) {
    redirect("/signin");
  }

  return email;
});
