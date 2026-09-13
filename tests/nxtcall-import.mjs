import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
const source = await readFile(
  new URL("../lib/import-leads.ts", import.meta.url),
  "utf8",
);
const js = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { parseCSV, suggest, prepare } = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);
const f = [
  {
    id: "budget-custom",
    name: "Budget",
    type: "number",
    options: "[]",
    required: false,
  },
];
assert.deepEqual(suggest(["Name", "Phone", "Budget"], f), [
  "std:name",
  "std:phone",
  "skip",
]);
assert.deepEqual(suggest(["Name", "Name", "Phone"], []), [
  "std:name",
  "skip",
  "std:phone",
]);
assert.deepEqual(
  parseCSV('\uFEFFName,Phone,Notes\r\n"Gupta, R",9876543210,"Hello\nagain"'),
  [
    ["Name", "Phone", "Notes"],
    ["Gupta, R", "9876543210", "Hello\nagain"],
  ],
);
assert.throws(() => parseCSV('"bad'), /Unclosed/);
const heads = ["Name", "Phone", "Budget"],
  rows = [["Rahul", "9876543210", "80"]];
let r = prepare(
  heads,
  rows,
  ["std:name", "std:phone", "custom:budget-custom"],
  f,
  [],
);
assert.equal(r.errors.length, 0);
assert.equal(r.leads[0].custom["budget-custom"], "80");
assert.equal(r.leads[0].budget, undefined);
r = prepare(heads, rows, ["std:name", "std:phone", "std:budget"], f, []);
assert.equal(r.leads[0].budget, "80");
assert.ok(
  prepare(
    heads,
    rows,
    ["std:name", "std:phone", "std:phone"],
    f,
    [],
  ).errors.some((x) => x.includes("same CRM")),
);
assert.ok(
  prepare(
    heads,
    [["A", "9876543210", "80 lakh"]],
    ["std:name", "std:phone", "custom:budget-custom"],
    f,
    [],
  ).errors.some((x) => x.includes("number")),
);
assert.ok(
  prepare(
    heads,
    [...rows, ...rows],
    ["std:name", "std:phone", "skip"],
    f,
    [],
  ).errors.some((x) => x.includes("duplicate")),
);
assert.ok(
  prepare(heads, rows, ["std:name", "std:phone", "skip"], f, [
    { phone: "+919876543210" },
  ]).errors.some((x) => x.includes("already exists")),
);
assert.ok(
  prepare(
    heads,
    [["A", "123", "80"]],
    ["std:name", "std:phone", "skip"],
    f,
    [],
  ).errors.some((x) => x.includes("10–15")),
);
const db = new PGlite();
await db.exec(
  "create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);",
);
await db.exec(
  await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8"),
);
await db.exec(
  await readFile(
    new URL("../supabase/migrations/20260913_nxtcall.sql", import.meta.url),
    "utf8",
  ),
);
const migration = await readFile(
  new URL("../supabase/migrations/20260913_client_scope.sql", import.meta.url),
  "utf8",
);
await db.exec(migration);
await db.exec(migration);
const admin = "00000000-0000-4000-8000-000000000001",
  caller = "00000000-0000-4000-8000-000000000002";
for (const [id, role] of [
  [admin, "admin"],
  [caller, "caller"],
]) {
  await db.query("insert into auth.users values($1)", [id]);
  await db.query(
    "insert into public.users(id,email,name,role) values($1,$2,$3,$4)",
    [id, id + "@example.test", role, role],
  );
}
const mutate = async (id, b) =>
  (
    await db.query("select public.crm_mutate_v2($1,$2::jsonb) r", [
      id,
      JSON.stringify(b),
    ])
  ).rows[0].r;
const snap = async (id) =>
  (await db.query("select public.crm_snapshot_v2($1) r", [id])).rows[0].r;
const c1 = (
  await mutate(admin, { action: "catalog", kind: "client", name: "Client A" })
).id;
const c2 = (
  await mutate(admin, { action: "catalog", kind: "client", name: "Client B" })
).id;
const project = (
  await mutate(admin, {
    action: "catalog",
    kind: "project",
    client_id: c1,
    name: "Project A",
  })
).id;
const campaign = (
  await mutate(admin, {
    action: "catalog",
    kind: "campaign",
    client_id: c1,
    project_id: project,
    name: "Campaign A",
  })
).id;
await mutate(admin, {
  action: "lead",
  lead: {
    name: "Caller lead",
    phone: "9876543210",
    assignee: caller,
    client_id: c1,
    project_id: project,
    campaign_id: campaign,
  },
});
await mutate(admin, {
  action: "lead",
  lead: { name: "Private lead", phone: "9876543211", client_id: c2 },
});
let s = await snap(caller);
const lead = s.leads[0];
await mutate(caller, {
  action: "update",
  id: lead.id,
  outcome: "Answered",
  status: "Interested",
});
s = await snap(caller);
assert.equal(s.events[0].client_id, c1);
assert.equal(s.leads.length, 1);
assert.ok(!s.clients.some((c) => c.id === c2));
await mutate(admin, { action: "assign", id: lead.id, assignee: admin });
s = await snap(caller);
assert.equal(s.leads.length, 0);
assert.equal(s.events[0].client_id, c1);
assert.equal(s.events[0].userId, caller);
await assert.rejects(
  mutate(caller, {
    action: "catalog",
    kind: "campaign",
    name: "Denied",
    client_id: c1,
  }),
  /Admin access/,
);
await assert.rejects(
  mutate(caller, {
    action: "field",
    name: "Denied",
    type: "text",
    options: [],
  }),
  /Admin access/,
);
await db.exec("set role authenticated");
await assert.rejects(snap(admin), /permission denied/);
await db.close();
console.log(
  "PASS: CSV parsing, ambiguous Budget mapping, duplicate target prevention, row validation, and client-scoped call metrics with preserved caller isolation.",
);
