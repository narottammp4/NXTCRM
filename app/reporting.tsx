"use client";
import { useEffect, useMemo, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { callMetrics, dateBounds, reportDay, shiftDay, CLOSED_STATUSES, type ReportEvent } from "@/lib/reporting";
const colours = ["#949d00", "#526eaa", "#e39b38", "#9b72b0", "#d76563", "#3b9691", "#577181", "#967852"];
const formatTime = (value: string) => new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
type Detail = { title: string; events?: ReportEvent[]; leads?: any[] };
export function MetricDetails({ detail, onClose, onOpen }: { detail: Detail | null; onClose: () => void; onOpen: (lead: any) => void }) {
  const [limit, setLimit] = useState(50);
  useEffect(() => setLimit(50), [detail]);
  const rows = detail?.events || detail?.leads || [];
  return <Dialog open={!!detail} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="metric-dialog">
      <DialogHeader><DialogTitle>{detail?.title}</DialogTitle><DialogDescription>{rows.length} records · Call times shown in IST</DialogDescription></DialogHeader>
      <div className="metric-records">
        {!rows.length && <p className="empty">No records match these filters.</p>}
        {rows.slice(0, limit).map((row: any) => <article className="metric-record" key={row.id}>
          <div><strong>{row.name || "Lead"}</strong><p>{row.phone}{row.project && row.project !== "Not specified" ? " · " + row.project : ""}</p>
            {detail?.events ? <><small>{formatTime(row.created)} · {row.outcome || row.status || row.type}{row.callerName ? " · " + row.callerName : ""}</small>{row.note && <p className="recent-note">{row.note}</p>}</> : <><small>{row.status}{row.followup ? " · Follow-up: " + formatTime(row.followup) : ""}{row.visit ? " · Visit: " + formatTime(row.visit) : ""}</small>{row.followup_important && row.followup && <span className="badge amber">Important</span>}</>}
          </div>
          {(!detail?.events || row.canOpen) && <button className="secondary" onClick={() => { onClose(); onOpen(detail?.events ? { id: row.leadId } : row); }}>Open lead</button>}
        </article>)}
        {rows.length > limit && <button className="secondary" onClick={() => setLimit(limit + 50)}>Show 50 more</button>}
      </div>
    </DialogContent>
  </Dialog>;
}
export default function Reporting({ data, clientFilter = "all", onOpen, defaultPeriod = "7", compact = false }: { data: any; clientFilter?: string; onOpen: (lead: any) => void; defaultPeriod?: string; compact?: boolean }) {
  const admin = data.user.role === "admin";
  const [caller, setCaller] = useState("all");
  const [period, setPeriod] = useState(defaultPeriod);
  const [clock, setClock] = useState(Date.now());
  const [start, setStart] = useState(shiftDay(reportDay(), 1 - Number(defaultPeriod))), [end, setEnd] = useState(reportDay());
  const [custom, setCustom] = useState<{start:string;end:string} | null>(null);
  const [dateError, setDateError] = useState("");
  const [result, setResult] = useState<any>(null), [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [detail, setDetail] = useState<Detail | null>(null);
  useEffect(() => { const id = setInterval(() => setClock(Date.now()), 60000); return () => clearInterval(id); }, []);
  const day = reportDay(clock);
  const bounds = period === "custom" && custom ? dateBounds(custom.start, custom.end)! : dateBounds(shiftDay(day, 1 - Number(period)), day)!;
  const effectiveCaller = admin ? caller : data.user.id;
  const key = [bounds.from, bounds.to, clientFilter, effectiveCaller].join("|");
  useEffect(() => {
    const controller = new AbortController();
    setResult(null); setError(""); setDetail(null);
    const params = new URLSearchParams({from: bounds.from, to: bounds.to});
    if (clientFilter !== "all") params.set("client", clientFilter);
    if (effectiveCaller !== "all") params.set("caller", effectiveCaller);
    fetch("/api/crm/report?" + params, { cache: "no-store", signal: controller.signal }).then(async response => {
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "Unable to load report");
      if (!controller.signal.aborted) setResult({key, value});
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [key, data, retry, clock, bounds.from, bounds.to, clientFilter, effectiveCaller]);
  const report = result?.key === key ? result.value : null;
  const events: ReportEvent[] = report?.events || [];
  const metrics = useMemo(() => callMetrics(events), [events]);
  const users: any[] = report?.users || [];
  const leads: any[] = report?.leads || [];
  const inRange = (value: string) => !!value && Date.parse(value) >= Date.parse(bounds.from) && Date.parse(value) < Date.parse(bounds.to);
  const leadGroups = (items: any[]) => ({
    visits: items.filter(l => l.status === "Site Visit Booked" && inRange(l.visit)),
    won: items.filter(l => l.status === "Booked / Won"),
    overdue: items.filter(l => !CLOSED_STATUSES.includes(l.status) && l.followup && Date.parse(l.followup) < clock),
  });
  const showEvents = (title: string, rows: ReportEvent[]) => setDetail({title, events: [...rows].reverse().map(e => ({...e, callerName: users.find(u => u.id === e.userId)?.name, canOpen: data.leads.some((l:any) => l.id === e.leadId)}))});
  const showLeads = (title: string, rows: any[]) => setDetail({title, leads: rows});
  const uniqueAnswered = callMetrics(metrics.answered).fresh;
  const outcomeData = Object.entries(metrics.calls.reduce((acc: Record<string,number>, e) => { acc[e.outcome!] = (acc[e.outcome!] || 0) + 1; return acc; }, {})).map(([name,value]) => ({name,value}));
  const trend: Record<string,any> = {};
  const startDay = reportDay(bounds.from), endDay = reportDay(Date.parse(bounds.to) - 1);
  // Use months for long ranges so charts remain legible; card counts always use individual calls.
  const monthly = (Date.parse(bounds.to) - Date.parse(bounds.from)) / 86400000 > 90;
  if (monthly) {
    for (let cursor = startDay.slice(0,7) + "-01"; cursor <= endDay;) {
      const label = cursor.slice(0,7); trend[label] = {date: label};
      const d = new Date(cursor + "T00:00:00Z"); d.setUTCMonth(d.getUTCMonth()+1); cursor = d.toISOString().slice(0,10);
    }
  } else {
    for (let cursor = startDay; cursor <= endDay; cursor = shiftDay(cursor,1)) trend[cursor] = {date:cursor};
  }
  for (const e of metrics.calls) {
    const label = monthly ? reportDay(e.created).slice(0,7) : reportDay(e.created);
    if (trend[label]) trend[label][e.userId] = (trend[label][e.userId] || 0) + 1;
  }
  const trendRows = Object.values(trend);
  function exportCSV() {
    const rows: any[][] = [["Period start (IST)", startDay, "Period end (IST)", endDay], ["Caller", "Logged calls", "Answered", "Fresh calls (unique phones)", "Redials", "Unique numbers answered", "Updates & notes", "Visits scheduled in range", "Won (current)", "Overdue follow-ups (current)"]];
    const add = (name: string, ev: ReportEvent[], ls: any[]) => {
      const m = callMetrics(ev), g = leadGroups(ls);
      rows.push([name,m.calls.length,m.answered.length,m.fresh.length,m.redials.length,callMetrics(m.answered).fresh.length,m.updates.length,g.visits.length,g.won.length,g.overdue.length]);
    };
    add(effectiveCaller === "all" ? "All callers (unique phones across callers)" : "Selected caller",events,leads);
    if (effectiveCaller === "all") users.forEach(u => add(u.name,events.filter(e => e.userId===u.id),leads.filter(l => l.assignee===u.id)));
    const csv = rows.map(row => row.map(v => '"'+String(v).replace(/^[=+@-]/,"'").replaceAll('"','""')+'"').join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}));
    const a = document.createElement("a"); a.href=url; a.download=`caller-performance-${startDay}-to-${endDay}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
  }
  return <section className="reporting-workspace" aria-label="Call report">
    <div className="report-controls">
      {admin ? <label>Caller<select aria-label="Choose caller" value={caller} onChange={e => setCaller(e.target.value)}><option value="all">All callers</option>{data.users.map((u:any) => <option key={u.id} value={u.id}>{u.name}{u.role === "admin" ? " (Admin)" : ""}</option>)}</select></label> : <div className="report-owner"><strong>Your call report</strong><small>Only your activity · IST</small></div>}
      <form className="report-range" onSubmit={e => { e.preventDefault(); if (!dateBounds(start,end)) {setDateError("Choose a valid start and end date.");return;} setDateError("");setCustom({start,end});setPeriod("custom"); }}>
        <label>From<input type="date" required value={start} onChange={e => setStart(e.target.value)} /></label>
        <label>To<input type="date" required min={start} value={end} onChange={e => setEnd(e.target.value)} /></label>
        <button className="secondary" type="submit">Apply range</button>
      </form>
      <label>Reporting period<select aria-label="Reporting period" value={period} onChange={e => { const v=e.target.value;setPeriod(v);setDateError("");if(v!=="custom"){setStart(shiftDay(day,1-Number(v)));setEnd(day);} }}><option value="1">Today</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option>{custom && <option value="custom">Custom range</option>}</select></label>
      <button className="secondary" disabled={!report} onClick={exportCSV}>Export CSV</button>
    </div>
    {dateError && <p className="report-error" role="alert">{dateError}</p>}
    <p className="report-caption">{startDay} to {endDay}, inclusive · India Standard Time. Fresh calls count unique phone numbers; redials count additional calls within this period. Cancelled calls are excluded.</p>
    {error ? <div className="panel report-state" role="alert"><p>{error}</p><button className="secondary" onClick={() => setRetry(r=>r+1)}>Retry</button></div> : !report ? <div className="panel report-state" role="status">Loading report…</div> : <>
      <div className="stats-grid report-stats">
        {([
          ["Logged calls",metrics.calls,"All saved calls in the period"],
          ["Answered",metrics.answered,"Calls marked Answered"],
          ["Fresh calls",metrics.fresh,"Unique phone numbers called"],
          ["Redials",metrics.redials,"Additional calls to the same number"],
          ["Unique leads contacted",uniqueAnswered,"Unique phone numbers answered"],
          ["Updates & notes",metrics.updates,"Saved lead updates in the period"],
        ] as [string,ReportEvent[],string][]).map(([label,rows,sub]) => <button className="stat" key={label} onClick={() => showEvents(label,rows)}><span>{label}</span><strong>{rows.length}</strong><small>{sub} · View details →</small></button>)}
      </div>
      <div className="report-charts">
        <section className="panel"><div className="panel-heading"><div><h2>Call outcomes</h2><p>All logged calls in the selected period</p></div></div>
          {outcomeData.length ? <><div className="report-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie isAnimationActive={false} data={outcomeData} nameKey="name" dataKey="value" innerRadius={58} outerRadius={90} paddingAngle={2}>{outcomeData.map((d,i) => <Cell key={d.name} fill={colours[i%colours.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div><div className="outcome-legend">{outcomeData.map((d,i) => <button key={d.name} onClick={()=>showEvents(d.name,metrics.calls.filter(e=>e.outcome===d.name))}><i style={{background:colours[i%colours.length]}} />{d.name}<strong>{d.value}</strong></button>)}</div></> : <p className="empty">No calls in this period.</p>}
        </section>
        <section className="panel"><div className="panel-heading"><div><h2>{admin ? "Calls by caller" : "Your calling activity"}</h2><p>{monthly ? "Monthly" : "Daily"} logged calls · IST</p></div></div>
          {metrics.calls.length ? <div className="report-chart report-trend"><ResponsiveContainer width="100%" height="100%"><BarChart data={trendRows}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="date" tickFormatter={v=>monthly?String(v):String(v).slice(5)} minTickGap={25}/><YAxis allowDecimals={false}/><Tooltip/><Legend/>{users.map((u,i)=><Bar isAnimationActive={false} key={u.id} dataKey={u.id} name={u.name} stackId="calls" fill={colours[i%colours.length]} />)}</BarChart></ResponsiveContainer></div> : <p className="empty">No calls in this period.</p>}
        </section>
      </div>
      {!compact && <><section className="panel"><div className="panel-heading"><div><h2>{admin ? "Caller performance" : "Your performance"}</h2><p>Calls and scheduled visits use the selected dates. Won leads and overdue follow-ups show the current pipeline.</p></div></div>
        <div className="report-table-wrap"><table className="report-table"><thead><tr>{["Caller","Logged calls","Answered","Fresh calls","Redials","Visits in range","Won (current)","Overdue (current)"].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{users.map(u=>{
          const m=callMetrics(events.filter(e=>e.userId===u.id)), g=leadGroups(leads.filter(l=>l.assignee===u.id));
          return <tr key={u.id}><th>{u.name}</th>{([["Logged calls",m.calls],["Answered",m.answered],["Fresh calls",m.fresh],["Redials",m.redials]] as [string,ReportEvent[]][]).map(([label,rows])=><td key={label}><button className="metric-link" onClick={()=>showEvents(u.name+" · "+label,rows)}>{rows.length}</button></td>)}{([["Visits in range",g.visits],["Won leads",g.won],["Overdue follow-ups",g.overdue]] as [string,any[]][]).map(([label,rows])=><td key={label}><button className="metric-link" onClick={()=>showLeads(u.name+" · "+label,rows)}>{rows.length}</button></td>)}</tr>;
        })}</tbody></table></div>
        {admin && <p className="report-caption">Fresh calls and redials are calculated separately for each caller. Combined totals deduplicate phone numbers across all selected callers.</p>}
      </section>
      <section className="panel"><div className="panel-heading"><h2>Recent activity</h2><button className="text-button" onClick={()=>showEvents("All activity",events)}>View all ({events.length})</button></div>{events.length ? [...events].reverse().slice(0,10).map(e=><div className="visit-row" key={e.id}><strong>{e.name} · {e.outcome || e.status || e.type}</strong><small>{users.find(u=>u.id===e.userId)?.name} · {formatTime(e.created)}</small>{e.note && <p className="recent-note">{e.note}</p>}</div>):<p className="empty">No activity in this period.</p>}</section></>}
    </>}
    <MetricDetails detail={detail} onClose={()=>setDetail(null)} onOpen={onOpen}/>
  </section>;
}
