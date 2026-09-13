import CRM from "./crm";
import { sessionClient, configured } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Home() {
  if (!configured()) redirect("/login");
  const s = await sessionClient();
  const {
    data: { user },
  } = await s.auth.getUser();
  if (!user) redirect("/login");
  return <CRM />;
}
