import { getServerSession } from "next-auth";
import { authOptions, isAllowedEmail } from "../auth";

export async function requireUserEmail(): Promise<string> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase();
  if (!email || !isAllowedEmail(email)) {
    throw new Error("UNAUTHORIZED");
  }
  return email;
}
