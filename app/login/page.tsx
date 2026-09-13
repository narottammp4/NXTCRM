import Login from "./form";
import { configured } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <main className="login">
      <div className="brandmark">N</div>
      <h1>NxtCall</h1>
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
