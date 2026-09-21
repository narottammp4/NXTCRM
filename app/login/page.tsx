import Image from "next/image";
import Login from "./form";
import { configured } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <main className="login">
      <Image src="/nxtcall-logo.svg" alt="NxtCall" width={180} height={138} unoptimized priority style={{ objectFit: "contain", flexShrink: 0, borderRadius: 10 }} />
      <p>Your leads. Your next conversation.</p>
      {configured() ? (
        <Login />
      ) : (
        <p>
          Setup needed: follow README.md to connect Supabase and create your
          admin account.
        </p>
      )}
      <small>Admin & caller access · Real estate CRM</small>
    </main>
  );
}
