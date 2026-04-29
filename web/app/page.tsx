import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions, isAllowedEmail } from "@/lib/auth";
import PublicEntryExperience from "@/components/PublicEntryExperience";

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase();

  if (email && isAllowedEmail(email)) {
    redirect("/today");
  }

  return <PublicEntryExperience mode="home" />;
}
