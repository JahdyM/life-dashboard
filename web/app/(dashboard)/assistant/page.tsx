import AssistantClient from "@/components/assistant/AssistantClient";
import { getAuthenticatedPageEmail } from "@/lib/server/pageAuth";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  await getAuthenticatedPageEmail();
  return <AssistantClient />;
}
