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
const a = "00000000-0000-4000-8000-000000000001",
  c = "00000000-0000-4000-8000-000000000002",
  o = "00000000-0000-4000-8000-000000000003";
for (const [id, role] of [
  [a, "admin"],
  [c, "caller"],
  [o, "caller"],
]) {
  await db.query("insert into auth.users values($1)", [id]);
  await db.query(
    "insert into public.users(id,email,name,role) values($1,$2,$3,$4)",
    [id, id + "@test.invalid", role, role],
  );
}
const rpc = async (name, args) =>
  (
    await db.query(
      "select public." +
        name +
        "($1" +
        (args.length === 2 ? ",$2::jsonb" : "") +
        ") as result",
      args.map((x, i) => (i === 1 ? JSON.stringify(x) : x)),
    )
  ).rows[0].result;
await rpc("crm_mutate", [
  a,
  {
    action: "lead",
    lead: {
      name: "Existing lead",
      phone: "9876543210",
      project: "Existing project",
      assignee: c,
      custom: {},
    },
  },
]);
let before = await rpc("crm_snapshot", [a]);
const leadId = before.leads[0].id;
await rpc("crm_mutate", [
  c,
  {
    action: "update",
    id: leadId,
    outcome: "Answered",
    note: "Keep this note",
    status: "Interested",
  },
]);
await rpc("crm_mutate", [c, { action: "startCall", id: leadId }]);
const migration = await readFile(
  new URL("../supabase/migrations/20260913_nxtcall.sql", import.meta.url),
  "utf8",
);
await db.exec(migration);
await db.exec(migration);
const mutate = (id, b) => rpc("crm_mutate_v2", [id, b]),
  snap = (id) => rpc("crm_snapshot_v2", [id]);
let s = await snap(a);
assert.equal(s.leads.length, 1);
assert.equal(s.leads[0].id, leadId);
assert.equal(s.leads[0].project, "Existing project");
assert.equal(s.activities[0].note, "Keep this note");
assert.equal(s.user.id, a);
assert.equal((await snap(c)).pending.leadId, leadId);
assert.equal(s.users.filter((u) => u.role === "admin").length, 1);
const client = (
  await mutate(a, { action: "catalog", kind: "client", name: "Client A" })
).id;
const other = (
  await mutate(a, { action: "catalog", kind: "client", name: "Client B" })
).id;
const project = (
  await mutate(a, {
    action: "catalog",
    kind: "project",
    client_id: client,
    name: "Project A",
  })
).id;
const campaign = (
  await mutate(a, {
    action: "catalog",
    kind: "campaign",
    client_id: client,
    project_id: project,
    name: "Meta ad A",
  })
).id;
await assert.rejects(
  mutate(c, { action: "catalog", kind: "client", name: "Forbidden" }),
  /Admin access/,
);
await assert.rejects(
  mutate(c, { action: "categorize", id: leadId, client_id: client }),
  /Admin access/,
);
await assert.rejects(
  mutate(a, {
    action: "lead",
    lead: {
      name: "Mismatch",
      phone: "9876543211",
      client_id: other,
      project_id: project,
    },
  }),
  /does not belong/,
);
await assert.rejects(
  mutate(a, {
    action: "lead",
    lead: {
      name: "Mismatch",
      phone: "9876543211",
      client_id: client,
      campaign_id: campaign,
    },
  }),
  /does not match/,
);
await mutate(a, {
  action: "categorize",
  id: leadId,
  client_id: client,
  project_id: project,
  campaign_id: campaign,
});
await mutate(a, {
  action: "lead",
  lead: {
    name: "Other caller lead",
    phone: "9876543212",
    client_id: other,
    assignee: o,
  },
});
s = await snap(c);
assert.equal(s.leads.length, 1);
assert.equal(s.leads[0].campaign_id, campaign);
assert.ok(!s.clients.some((x) => x.id === other));
assert.equal(s.users.length, 1);
await assert.rejects(
  mutate(c, {
    action: "lead",
    lead: { name: "Access denied", phone: "9876543213", client_id: other },
  }),
  /access denied/,
);
await assert.rejects(
  mutate(c, { action: "assign", id: leadId, assignee: o }),
  /Admin access/,
);
await assert.rejects(
  mutate(c, { action: "toggleUser", id: o, active: false }),
  /Admin access/,
);
await assert.rejects(
  mutate(c, { action: "field", name: "Bad", type: "text", options: [] }),
  /Admin access/,
);
await mutate(c, {
  action: "import",
  rows: [
    {
      name: "Import A",
      phone: "9876543214",
      client_id: client,
      project_id: project,
      campaign_id: campaign,
    },
    {
      name: "Import B",
      phone: "9876543215",
      client_id: client,
      project_id: project,
      campaign_id: campaign,
    },
  ],
});
s = await snap(c);
assert.equal(s.leads.length, 3);
assert.equal(s.leads.filter((l) => l.campaign_id === campaign).length, 3);
const n = (await snap(a)).leads.length;
await assert.rejects(
  mutate(c, {
    action: "import",
    rows: [
      { name: "Rollback", phone: "9876543216", client_id: client },
      { name: "Duplicate", phone: "9876543214", client_id: client },
    ],
  }),
  /unique/,
);
assert.equal((await snap(a)).leads.length, n);
await mutate(c, {
  action: "update",
  id: leadId,
  outcome: "Answered",
  status: "Follow-up Required",
  followup: new Date(Date.now() + 3600000).toISOString(),
  note: "Follow up tomorrow",
});
assert.equal((await snap(c)).pending, null);
await db.exec("set role authenticated");
await assert.rejects(snap(a), /permission denied/);
await assert.rejects(
  db.query("select * from public.clients"),
  /permission denied/,
);
await assert.rejects(
  mutate(a, { action: "catalog", kind: "client", name: "Spoofed" }),
  /permission denied/,
);
await db.exec("reset role");
await mutate(a, { action: "toggleUser", id: c, active: false });
await assert.rejects(snap(c), /disabled/);
console.log(
  "PASS: repeatable migration preserves accounts/leads/history/pending calls; client/project/campaign validation; assigned-only caller reads; admin-only category management; imports remain atomic; caller updates still work; direct database access denied.",
);
await db.close();
