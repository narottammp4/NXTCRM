import { NextResponse } from "next/server";
import { sessionClient } from "@/lib/supabase/server";
import { actor } from "@/lib/crm";
export async function POST(req: Request) {
  try {
    if (req.headers.get("origin") !== new URL(req.url).origin)
      return NextResponse.json(
        { error: "Invalid request origin" },
        { status: 403 },
      );
    const text = await req.text();
    if (text.length > 10000)
      return NextResponse.json({ error: "Request too large" }, { status: 413 });
    const b = JSON.parse(text),
      s = await sessionClient();
    if (b.action === "logout") {
      await s.auth.signOut();
      return NextResponse.json({ ok: true });
    }
    if (b.action === "login") {
      const { error } = await s.auth.signInWithPassword({
        email: String(b.email || "").trim(),
        password: String(b.password || ""),
      });
      if (error)
        return NextResponse.json(
          {
            error:
              "Unable to sign in. Check your email and password, or try again later.",
          },
          { status: 401 },
        );
      try {
        await actor();
      } catch {
        await s.auth.signOut();
        return NextResponse.json(
          { error: "Your account is not enabled. Contact your admin." },
          { status: 403 },
        );
      }
    } else if (b.action === "password") {
      const u = await actor();
      if (
        typeof b.password !== "string" ||
        b.password.length < 12 ||
        b.password.length > 128
      )
        throw new Error("Use a password with 12–128 characters");
      const { error: check } = await s.auth.signInWithPassword({
        email: u.email,
        password: String(b.currentPassword || ""),
      });
      if (check) throw new Error("Current password is incorrect");
      const { error } = await s.auth.updateUser({ password: b.password });
      if (error)
        throw new Error(
          "Password could not be changed. Try a different password.",
        );
    } else throw new Error("Unknown action");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message.replace(/^\d{3}:/, "")
            : "Unable to complete request",
      },
      { status: 400 },
    );
  }
}
