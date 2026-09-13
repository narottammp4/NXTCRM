import { NextResponse } from "next/server";
import { actor, admin } from "@/lib/crm";
import { serviceClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
function fail(e: unknown) {
  const m =
    e instanceof Error ? e.message : "Unable to save. Please try again.";
  return NextResponse.json(
    { error: m.replace(/^\d{3}:/, "") },
    {
      status: /^\d{3}:/.test(m) ? Number(m.slice(0, 3)) : 400,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
export async function GET() {
  try {
    const u = await actor();
    const { data, error } = await serviceClient().rpc("crm_snapshot_v2", {
      actor_id: u.id,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(req: Request) {
  try {
    if (req.headers.get("origin") !== new URL(req.url).origin)
      throw new Error("403:Invalid request origin");
    if (!req.headers.get("content-type")?.includes("application/json"))
      throw new Error("415:JSON required");
    const u = await actor(),
      s = serviceClient();
    const raw = await req.text();
    if (raw.length > 2_000_000)
      throw new Error("413:Import is too large. Split into smaller files.");
    const b = JSON.parse(raw);
    if (!b || typeof b !== "object" || Array.isArray(b))
      throw new Error("Invalid request");
    if (b.action === "user" || b.action === "resetPassword") {
      admin(u);
      if (
        typeof b.password !== "string" ||
        b.password.length < 12 ||
        b.password.length > 128
      )
        throw new Error("Use a password with 12–128 characters");
      if (b.action === "resetPassword") {
        const { data: target } = await s
          .from("users")
          .select("id")
          .eq("id", b.id)
          .eq("role", "caller")
          .single();
        if (!target) throw new Error("404:Caller not found");
        const { error } = await s.auth.admin.updateUserById(target.id, {
          password: b.password,
        });
        if (error)
          throw new Error("Password reset failed. Try a different password.");
      } else {
        const name = String(b.name || "")
            .trim()
            .slice(0, 100),
          email = String(b.email || "")
            .trim()
            .toLowerCase();
        if (!name || !/^\S+@\S+\.\S+$/.test(email) || email.length > 200)
          throw new Error("Enter a name and valid email");
        const { data, error } = await s.auth.admin.createUser({
          email,
          password: b.password,
          email_confirm: true,
        });
        if (error)
          throw new Error(
            "Account could not be created. Check whether this email already exists and that the password meets your Supabase settings.",
          );
        const { error: profileError } = await s.from("users").insert({
          id: data.user.id,
          email,
          name,
          role: "caller",
          active: true,
        });
        if (profileError) {
          await s.auth.admin.deleteUser(data.user.id);
          throw new Error(
            "Unable to create caller profile. Check database setup.",
          );
        }
      }
      return NextResponse.json({ ok: true });
    }
    if (
      b.action === "field" &&
      (!Array.isArray(b.options) ||
        b.options.length > 50 ||
        b.options.some((x: unknown) => typeof x !== "string" || x.length > 80))
    )
      throw new Error("Use up to 50 options of 80 characters each");
    const { data, error } = await s.rpc("crm_mutate_v2", { actor_id: u.id, b });
    if (error) {
      if (error.code === "23505")
        throw new Error(
          "409:This phone number, field, or category name already exists. No changes were saved.",
        );
      if (error.code === "23514")
        throw new Error("Select a valid status or field type");
      throw new Error(error.message);
    }
    return NextResponse.json(data);
  } catch (e) {
    return fail(e);
  }
}
