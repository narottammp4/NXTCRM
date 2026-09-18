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
export function decodeLeadFile(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0x50 && bytes[1] === 0x4b)
    throw Error("This is an Excel workbook. Export it as CSV or tab-separated text first.");
  let encoding = "utf-8";
  if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = "utf-16le";
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = "utf-16be";
  else {
    const sample = bytes.slice(0, 200);
    const even = sample.filter((b, i) => i % 2 === 0 && b === 0).length;
    const odd = sample.filter((b, i) => i % 2 === 1 && b === 0).length;
    if (odd > sample.length / 5) encoding = "utf-16le";
    else if (even > sample.length / 5) encoding = "utf-16be";
  }
  try {
    return new TextDecoder(encoding, { fatal: true }).decode(buffer).replace(/^\uFEFF/, "");
  } catch {
    throw Error("Could not read the file encoding. Export as CSV UTF-8 or Unicode tab-separated text.");
  }
}

function parseSeparated(text: string, separator: string) {
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
    } else if (c === separator && !quoted) {
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

export function parseLeadText(input: string) {
  let text = input.replace(/^\uFEFF/, "");
  const directive = /^sep=([,;\t|])\r?\n/i.exec(text);
  if (directive) text = text.slice(directive[0].length);
  const separators = directive ? [directive[1]] : [",", "\t", ";", "|"];
  const candidates = separators.flatMap((separator) => {
    try {
      const rows = parseSeparated(text, separator);
      const width = rows[0]?.length || 0;
      if (width < 2) return [];
      const sample = rows.slice(1, 51);
      const consistency = sample.length
        ? sample.filter((r) => r.length === width).length / sample.length : 1;
      return [{ rows, separator, score: consistency * 1000 + Math.min(width, 100) }];
    } catch { return []; }
  }).sort((a, b) => b.score - a.score);
  if (!candidates.length) {
    // Preserve a useful quote error instead of hiding it behind separator detection.
    parseSeparated(text, directive?.[1] || ",");
    throw Error("Could not identify separate columns. Export CSV or tab-separated text with a header row containing Name and Phone. Spaces alone are not column separators.");
  }
  const best = candidates[0];
  return { rows: best.rows, separator: best.separator };
}

export function parseCSV(text: string) {
  return parseLeadText(text).rows;
}
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
export function suggest(headers: string[], fields: Field[]) {
  const aliases: Record<string, string> = {
    fullname: "name",
    contactname: "name",
    mobile: "phone",
    mobilenumber: "phone",
    phonenumber: "phone",
    workphonenumber: "phone",
    workphone: "phone",
    contactnumber: "phone",
    contactphone: "phone",
    whatsappnumber: "phone",
    whatsapp: "phone",
    telephone: "phone",
    leadname: "name",
    customername: "name",
    yourname: "name",
    workemail: "email",
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
  options: { skipDuplicateChecks?: boolean; rowNumbers?: number[] } = {},
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
    const err = (m: string) => errors.push("Row " + (options.rowNumbers?.[index] ?? index + 2) + ": " + m);
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
    const rawPhone = String(l.phone || "").trim().replace(/^p:/i, "");
    const p = rawPhone.replace(/[\s().-]/g, "");
    const validPhone = /^\+?\d{10,15}$/.test(p);
    if (!validPhone) err("Phone must contain 10–15 digits. Use the full number, not scientific notation.");
    const phone = p.length === 10 ? "+91" + p : "+" + p.replace(/^\+/, "");
    if (validPhone) {
      l.phone = phone;
      if (!options.skipDuplicateChecks && phones.has(phone)) err("duplicate phone inside CSV.");
      phones.add(phone);
      if (!options.skipDuplicateChecks && known.has(phone)) err("phone already exists in your accessible leads.");
    }
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
