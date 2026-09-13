import "server-only";
import { sessionClient, serviceClient } from "@/lib/supabase/server";
export async function actor() {
  const s = await sessionClient(),
    {
      data: { user },
      error,
    } = await s.auth.getUser();
  if (error || !user) throw new Error("401:Sign in to continue");
  const { data: u, error: profileError } = await serviceClient()
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single();
  if (profileError || !u?.active)
    throw new Error("403:Your account has not been enabled by the admin");
  return u;
}
export function admin(u: { role: string }) {
  if (u.role !== "admin") throw new Error("403:Admin access required");
}
