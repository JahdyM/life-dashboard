import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import Dashboard from "@/components/Dashboard";

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/signin");
  }
  return <Dashboard userEmail={session.user?.email || ""} />;
}
