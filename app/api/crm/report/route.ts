import { NextResponse } from "next/server";
import { actor } from "@/lib/crm";
import { serviceClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const u = await actor();
    const p = new URL(req.url).searchParams;
    const from = p.get("from"), to = p.get("to");
    if (!from || !to || !Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) || Date.parse(from) >= Date.parse(to))
      throw new Error("400:Choose a valid date range");
    const caller = p.get("caller") || null, client = p.get("client") || null;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if ((caller && !uuid.test(caller)) || (client && !uuid.test(client))) throw new Error("400:Invalid report filter");
    if (u.role !== "admin" && caller && caller !== u.id) throw new Error("403:You can only view your own reports");
    const { data, error } = await serviceClient().rpc("crm_report", {
      actor_id: u.id, date_from: new Date(from).toISOString(), date_to: new Date(to).toISOString(),
      client_filter: client, caller_filter: u.role === "admin" ? caller : u.id,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    const m = e instanceof Error ? e.message : "Unable to load report";
    return NextResponse.json({ error: m.replace(/^\d{3}:/, "") }, {
      status: /^\d{3}:/.test(m) ? Number(m.slice(0, 3)) : 400,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
