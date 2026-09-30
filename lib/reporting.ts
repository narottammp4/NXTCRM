export type ReportEvent = {
  id: string; leadId: string; userId: string; type: string; outcome?: string;
  status?: string; note?: string; created: string; phone: string; name: string; project?: string;
};
export const CLOSED_STATUSES = ["Booked / Won", "Not Interested", "Lost"];
export function reportDay(value: string | number | Date = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}
export function shiftDay(day: string, days: number) {
  return new Date(Date.parse(day + "T00:00:00Z") + days * 86400000).toISOString().slice(0, 10);
}
export function dateBounds(start: string, end: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end)
    return null;
  const from = new Date(start + "T00:00:00+05:30"), last = new Date(end + "T00:00:00+05:30");
  if (!Number.isFinite(+from) || !Number.isFinite(+last) || reportDay(from) !== start || reportDay(last) !== end) return null;
  return { from: from.toISOString(), to: new Date(+last + 86400000).toISOString() };
}
export function reportPhone(phone: string) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.length === 10 ? "91" + digits : digits;
}
// First actual dial per phone in the selected scope is fresh; every later dial is a redial.
// Stable chronological ordering keeps drill-down rows consistent with totals.
export function callMetrics(events: ReportEvent[]) {
  const calls = events.filter(e => e.type === "call" && !!e.outcome && e.outcome !== "Cancelled / Not Dialled")
    .sort((a,b) => Date.parse(a.created) - Date.parse(b.created) || a.id.localeCompare(b.id));
  const seen = new Set<string>();
  const fresh: ReportEvent[] = [], redials: ReportEvent[] = [];
  for (const e of calls) {
    const key = reportPhone(e.phone) || e.leadId;
    if (seen.has(key)) redials.push(e); else { seen.add(key); fresh.push(e); }
  }
  return { calls, fresh, redials, answered: calls.filter(e => e.outcome === "Answered"), updates: events.filter(e => e.type === "update") };
}
