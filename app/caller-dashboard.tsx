"use client";
import { useEffect, useState } from "react";
import { Phone, Clock3, CalendarDays, ArrowUpRight, Check } from "lucide-react";
type Props = {
  data: any;
  busy: boolean;
  onCall: (lead: any) => void;
  onOpen: (lead: any) => void;
  onUpdate: (lead: any) => void;
};
export default function CallerDashboard({
  data,
  busy,
  onCall,
  onOpen,
  onUpdate,
}: Props) {
  const [tab, setTab] = useState("Overdue"),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);
  const today = (v: string) =>
    v && new Date(v).toDateString() === new Date(now).toDateString();
  const active = data.leads.filter(
    (l: any) => !["Booked / Won", "Not Interested / Lost"].includes(l.status),
  );
  const overdue = active
    .filter((l: any) => l.followup && Date.parse(l.followup) < now)
    .sort((a: any, b: any) => Date.parse(a.followup) - Date.parse(b.followup));
  const due = active
    .filter((l: any) => today(l.followup) && Date.parse(l.followup) >= now)
    .sort((a: any, b: any) => Date.parse(a.followup) - Date.parse(b.followup));
  const fresh = active
    .filter((l: any) => l.status === "New")
    .sort((a: any, b: any) => Date.parse(a.created) - Date.parse(b.created));
  const scheduled = active
    .filter((l: any) => l.followup && Date.parse(l.followup) >= now)
    .sort((a: any, b: any) => Date.parse(a.followup) - Date.parse(b.followup));
  const queues: Record<string, any[]> = {
    Overdue: overdue,
    "Due today": due,
    "New leads": fresh,
    Scheduled: scheduled,
  };
  const items = queues[tab];
  const calls = (data.events || []).filter(
    (a: any) =>
      a.userId === data.user.id &&
      a.type === "call" &&
      a.outcome !== "Cancelled / Not Dialled" &&
      today(a.created),
  );
  const answered = calls.filter((a: any) => a.outcome === "Answered");
  const visits = active
    .filter(
      (l: any) =>
        l.status === "Site Visit Booked" &&
        l.visit &&
        (Date.parse(l.visit) >= now || today(l.visit)),
    )
    .sort((a: any, b: any) => Date.parse(a.visit) - Date.parse(b.visit));
  const format = (v: string) =>
    new Date(v).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  const context = (l: any) =>
    [
      data.clients?.find((c: any) => c.id === l.client_id)?.name,
      l.project !== "Not specified" ? l.project : "",
      data.campaigns?.find((c: any) => c.id === l.campaign_id)?.name,
    ]
      .filter(Boolean)
      .join(" · ") || "Uncategorised";
  const [limit, setLimit] = useState(10);
  return (
    <div className="caller-dashboard">
      <div className="caller-intro">
        <div>
          <span className="eyebrow">YOUR NEXT CONVERSATION</span>
          <h2>
            {overdue.length
              ? overdue.length + " follow-ups need your attention."
              : due.length
                ? "Your follow-ups for today are ready."
                : "Start with a new conversation."}
          </h2>
          <p>Pick a lead, make the call, and save the next step.</p>
        </div>
        <span className="caller-day">
          <Clock3 size={18} />
          Your daily workspace
        </span>
      </div>
      <div className="stats-grid">
        {[
          ["My calls today", calls.length, "Manually logged calls", Phone],
          [
            "Answered today",
            answered.length,
            new Set(answered.map((a: any) => a.leadId)).size +
              " unique leads reached",
            Check,
          ],
          [
            "Follow-ups remaining",
            overdue.length + due.length,
            overdue.length + " overdue · " + due.length + " later today",
            Clock3,
          ],
          [
            "Site visits today",
            visits.filter((l: any) => today(l.visit)).length,
            "Check the schedule below",
            CalendarDays,
          ],
        ].map(([label, value, sub, Icon]: any) => (
          <div className="stat" key={label}>
            <div className="stat-top">
              <span>{label}</span>
              <Icon size={19} />
            </div>
            <strong>{value}</strong>
            <small>{sub}</small>
          </div>
        ))}
      </div>
      <div className="caller-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>My calling queue</h2>
              <p>Closed leads are excluded from this queue.</p>
            </div>
          </div>
          <div className="queue-tabs" role="group" aria-label="Calling queue">
            {Object.entries(queues).map(([name, rows]) => (
              <button
                key={name}
                aria-pressed={tab === name}
                className={tab === name ? "active" : ""}
                onClick={() => {
                  setTab(name);
                  setLimit(10);
                }}
              >
                {name}
                <span>{rows.length}</span>
              </button>
            ))}
          </div>
          {items.length ? (
            items.slice(0, limit).map((l: any) => (
              <div className="queue-row" key={l.id}>
                <div className="queue-contact">
                  <button className="lead-name" onClick={() => onOpen(l)}>
                    {l.name}
                    <ArrowUpRight size={15} />
                  </button>
                  <small>{context(l)}</small>
                  <button
                    className="phone-link"
                    disabled={busy}
                    onClick={() => onCall(l)}
                  >
                    {l.phone}
                  </button>
                  <div className="queue-meta">
                    <span className="badge blue">{l.status}</span>
                    {l.followup && (
                      <span
                        className={
                          Date.parse(l.followup) < now ? "overdue" : ""
                        }
                      >
                        {format(l.followup)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="queue-actions">
                  <button
                    className="call-button"
                    disabled={busy}
                    onClick={() => onCall(l)}
                  >
                    <Phone size={16} />
                    Call
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => onUpdate(l)}
                  >
                    Add update
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="empty">
              <Check size={28} />
              <h3>
                {tab === "Overdue"
                  ? "No overdue follow-ups"
                  : tab === "New leads"
                    ? "No new leads assigned"
                    : "Nothing in this queue"}
              </h3>
              <p>
                {tab === "New leads"
                  ? "Assigned new leads will appear here."
                  : "Choose another queue to continue your day."}
              </p>
            </div>
          )}
          {items.length > limit && (
            <div className="list-meta">
              <button
                className="secondary"
                onClick={() => setLimit(limit + 10)}
              >
                Show 10 more
              </button>
            </div>
          )}
        </section>
        <div className="caller-aside">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>My site visits</h2>
                <p>Today and upcoming</p>
              </div>
              <CalendarDays size={20} />
            </div>
            {visits.length ? (
              visits.slice(0, 8).map((l: any) => (
                <div className="visit-row" key={l.id}>
                  <button className="lead-name" onClick={() => onOpen(l)}>
                    {l.name}
                    <ArrowUpRight size={15} />
                  </button>
                  <small>{context(l)}</small>
                  <strong>{format(l.visit)}</strong>
                  {Date.parse(l.visit) < now && (
                    <small className="overdue">
                      Visit time passed — update the outcome
                    </small>
                  )}
                  <button className="text-button" onClick={() => onUpdate(l)}>
                    Update visit
                  </button>
                </div>
              ))
            ) : (
              <div className="empty">
                <p>No site visits scheduled.</p>
              </div>
            )}
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>My recent updates</h2>
            </div>
            {data.activities
              .filter((a: any) => a.userId === data.user.id)
              .slice(0, 5)
              .map((a: any) => (
                <div className="visit-row" key={a.id}>
                  <strong>
                    {data.leads.find((l: any) => l.id === a.leadId)?.name ||
                      "Lead"}
                  </strong>
                  <small>
                    {a.outcome || a.status || a.type} · {format(a.created)}
                  </small>
                  {a.note && <p className="recent-note">{a.note}</p>}
                </div>
              ))}
            {!data.activities.some((a: any) => a.userId === data.user.id) && (
              <div className="empty">
                <p>Your saved calls and notes will appear here.</p>
              </div>
            )}
          </section>
        </div>
      </div>
      <p className="bottom-note">
        Call figures reflect your saved outcomes. Follow-up times use this
        device’s timezone.
      </p>
    </div>
  );
}
