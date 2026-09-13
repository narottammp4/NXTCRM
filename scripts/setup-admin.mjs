import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const r = createInterface({ input: stdin, output: stdout });
try {
  const { data: existing, error: readError } = await s
    .from("users")
    .select("id")
    .eq("role", "admin");
  if (readError)
    throw new Error("Run supabase/schema.sql first: " + readError.message);
  if (existing.length)
    throw new Error(
      "Admin already exists. Use Supabase Authentication to recover that account.",
    );
  const name = (await r.question("Admin full name: ")).trim();
  const email = (await r.question("Admin email: ")).trim().toLowerCase();
  console.log(
    "Password input is visible in this local terminal. Use a private screen.",
  );
  const password = await r.question("Admin password (12+ characters): ");
  if (
    !name ||
    !/^\S+@\S+\.\S+$/.test(email) ||
    password.length < 12 ||
    password.length > 128
  )
    throw new Error(
      "Enter a name, valid email, and password of 12–128 characters.",
    );
  const { data, error } = await s.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  const { error: profileError } = await s
    .from("users")
    .insert({ id: data.user.id, email, name, role: "admin", active: true });
  if (profileError) {
    await s.auth.admin.deleteUser(data.user.id);
    throw profileError;
  }
  console.log("Admin created. Start the app and sign in.");
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  r.close();
}
