import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(
  "create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);",
);
await db.exec(
  await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8"),
);
const admin = "00000000-0000-4000-8000-000000000001",
  caller = "00000000-0000-4000-8000-000000000002",
  other = "00000000-0000-4000-8000-000000000003";
for (const [id, role, name] of [
  [admin, "admin", "Admin"],
  [caller, "caller", "Caller"],
  [other, "caller", "Other"],
]) {
  await db.query("insert into auth.users values($1)", [id]);
  await db.query(
    "insert into public.users(id,email,name,role) values($1,$2,$3,$4)",
    [id, name + "@example.test", name, role],
  );
}
const mutate = async (id, b) =>
  (
    await db.query("select public.crm_mutate($1,$2::jsonb) as result", [
      id,
      JSON.stringify(b),
    ])
  ).rows[0].result;
const snapshot = async (id) =>
  (await db.query("select public.crm_snapshot($1) as result", [id])).rows[0]
    .result;
await mutate(admin, {
  action: "lead",
  lead: { name: "Lead A", phone: "9876543210", assignee: caller, custom: {} },
});
await mutate(other, {
  action: "lead",
  lead: { name: "Lead B", phone: "9876543211", assignee: caller, custom: {} },
});
assert.equal((await snapshot(caller)).leads.length, 1);
assert.equal((await snapshot(other)).leads[0].assignee, other);
assert.equal((await snapshot(admin)).leads.length, 2);
const lead = (await snapshot(caller)).leads[0];
await assert.rejects(
  mutate(other, { action: "update", id: lead.id, note: "forbidden" }),
  /access denied/,
);
await assert.rejects(
  mutate(caller, {
    action: "field",
    name: "Budget",
    type: "number",
    options: [],
  }),
  /Admin access/,
);
await assert.rejects(
  mutate(caller, {
    action: "import",
    rows: [
      { name: "Valid", phone: "9876543212", custom: {} },
      { name: "Duplicate", phone: "9876543210", custom: {} },
    ],
  }),
  /unique/,
);
assert.equal(
  (await snapshot(admin)).leads.length,
  2,
  "Import rolls back every row",
);
await mutate(caller, { action: "startCall", id: lead.id });
await assert.rejects(
  mutate(caller, {
    action: "update",
    id: lead.id,
    status: "Site Visit Booked",
    outcome: "Answered",
  }),
  /visit date/,
);
assert.ok(
  (await snapshot(caller)).pending,
  "Invalid update preserves pending call",
);
await mutate(caller, {
  action: "update",
  id: lead.id,
  status: "Interested",
  outcome: "Answered",
  note: "Wants a 2 BHK",
});
let state = await snapshot(caller);
assert.equal(state.pending, null);
assert.equal(state.activities.length, 1);
assert.equal(state.leads[0].status, "Interested");
await mutate(admin, { action: "assign", id: lead.id, assignee: other });
assert.equal((await snapshot(caller)).leads.length, 0);
assert.equal((await snapshot(caller)).activities.length, 0);
assert.equal((await snapshot(caller)).events.filter(x=>x.type==='call').length, 1, 'Call credit survives reassignment');
await mutate(admin, { action: "toggleUser", id: other, active: false });
await assert.rejects(snapshot(other), /disabled/);
await assert.rejects(
  mutate(other, {
    action: "lead",
    lead: { name: "Blocked", phone: "9876543215" },
  }),
  /disabled/,
);
await db.exec("set role authenticated");
await assert.rejects(
  db.query("select * from public.leads"),
  /permission denied/,
);
await assert.rejects(snapshot(admin), /permission denied/);
await db.exec("reset role");
await mutate(admin, {
  action: "field",
  name: "Timeline",
  type: "dropdown",
  options: ["Soon", "Later"],
  required: true,
  position: 1,
});
await assert.rejects(
  mutate(caller, {
    action: "lead",
    lead: { name: "Missing custom", phone: "9876543216", custom: {} },
  }),
  /required/,
);
const field = (await snapshot(admin)).fields[0];
await mutate(caller, {
  action: "lead",
  lead: {
    name: "Custom lead",
    phone: "9876543216",
    custom: { [field.id]: "Soon" },
  },
});
console.log(
  "PASS: SQL schema, role isolation, reassignment, account disabling, atomic import, call updates, custom-field validation, and direct-access denial.",
);
await db.close();
