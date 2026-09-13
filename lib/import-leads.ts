export type Field = {
  id: string;
  name: string;
  type: string;
  options: string;
  required: boolean;
};
export const standard = [
  ["name", "Name"],
  ["phone", "Phone"],
  ["email", "Email"],
  ["budget", "Budget"],
  ["bhk", "Configuration / BHK"],
  ["location", "Location"],
  ["source", "Source"],
  ["project", "Project"],
] as const;
export function parseCSV(text: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw Error("Unclosed quote in CSV");
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  if (rows[0]) rows[0][0] = rows[0][0].replace(/^\uFEFF/, "");
  return rows;
}
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
export function suggest(headers: string[], fields: Field[]) {
  const aliases: Record<string, string> = {
    fullname: "name",
    contactname: "name",
    mobile: "phone",
    mobilenumber: "phone",
    phonenumber: "phone",
    emailaddress: "email",
    city: "location",
    interestedin: "bhk",
    configuration: "bhk",
  };
  const used = new Set<string>();
  return headers.map((h) => {
    const n = norm(h);
    const candidates = [
      ...standard
        .filter(
          ([k, label]) =>
            norm(k) === n || norm(label) === n || aliases[n] === k,
        )
        .map(([k]) => "std:" + k),
      ...fields.filter((f) => norm(f.name) === n).map((f) => "custom:" + f.id),
    ];
    if (candidates.length !== 1 || used.has(candidates[0])) return "skip";
    used.add(candidates[0]);
    return candidates[0];
  });
}
export function prepare(
  headers: string[],
  rows: string[][],
  mapping: string[],
  fields: Field[],
  existing: any[],
) {
  const errors: string[] = [];
  const targets = mapping.filter((x) => x !== "skip");
  if (!targets.includes("std:name") || !targets.includes("std:phone"))
    errors.push("Map Name and Phone before importing.");
  if (new Set(targets).size !== targets.length)
    errors.push("Two CSV columns cannot map to the same CRM field.");
  if (!rows.length || rows.length > 500)
    errors.push("Import between 1 and 500 rows.");
  const phones = new Set<string>(),
    known = new Set(existing.map((l) => l.phone));
  const leads = rows.map((row, index) => {
    const l: any = { custom: {} };
    const err = (m: string) => errors.push("Row " + (index + 2) + ": " + m);
    if (row.length !== headers.length)
      err("column count differs from the header.");
    mapping.forEach((target, col) => {
      if (target === "skip") return;
      const raw = (row[col] || "").trim();
      if (target.startsWith("std:")) {
        l[target.slice(4)] = raw;
        return;
      }
      const f = fields.find((f) => target === "custom:" + f.id);
      if (!f) {
        err("mapped custom field no longer exists.");
        return;
      }
      let v: any = raw;
      if (f.type === "checkbox") {
        if (raw === "") v = undefined;
        else if (["true", "yes", "1"].includes(raw.toLowerCase())) v = true;
        else if (["false", "no", "0"].includes(raw.toLowerCase())) v = false;
        else err(f.name + " needs true/false, yes/no, or 1/0.");
      }
      if (f.type === "number" && raw && !Number.isFinite(Number(raw)))
        err(f.name + " needs a number without currency text.");
      if (
        f.type === "date" &&
        raw &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(raw) ||
          !Number.isFinite(Date.parse(raw)) ||
          new Date(raw).toISOString().slice(0, 10) !== raw)
      )
        err(f.name + " needs a valid YYYY-MM-DD date.");
      const opts = JSON.parse(f.options || "[]");
      if (f.type === "multi-select") {
        v = raw
          .split(";")
          .map((x) => x.trim())
          .filter(Boolean);
        if (v.some((x: string) => !opts.includes(x)))
          err(f.name + " has an unknown option.");
      }
      if (f.type === "dropdown" && raw && !opts.includes(raw))
        err(f.name + " has an unknown option.");
      if (v !== undefined) l.custom[f.id] = v;
    });
    if (!l.name || l.name.length > 150)
      err("Name is required, up to 150 characters.");
    const p = String(l.phone || "").replace(/[^+\d]/g, "");
    if (!/^\+?\d{10,15}$/.test(p)) err("Phone must contain 10–15 digits.");
    const phone = p.length === 10 ? "+91" + p : "+" + p.replace(/^\+/, "");
    if (phones.has(phone)) err("duplicate phone inside CSV.");
    phones.add(phone);
    if (known.has(phone)) err("phone already exists in your accessible leads.");
    if (l.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(l.email))
      err("invalid email.");
    for (const f of fields) {
      const v = l.custom[f.id];
      if (
        f.required &&
        (v === undefined || v === "" || (Array.isArray(v) && !v.length))
      )
        err(f.name + " is required.");
    }
    return l;
  });
  return { leads, errors };
}
