"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  LayoutDashboard,
  Search,
  ChartNoAxesCombined,
  Plus,
  Phone,
  ArrowUpRight,
  Users,
  Building2,
  CalendarDays,
  Clock3,
  SlidersHorizontal,
  ChevronRight,
  Check,
  Upload,
  LogOut,
  ArrowDownToLine,
  RefreshCw,
  Trash2,
} from "lucide-react";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import CallerDashboard from "./caller-dashboard";
import LeadImport from "./lead-import";
import ImportSelect from "./import-select";
import BulkAssignment from "./bulk-assignment";
import { phoneKey } from "@/lib/enquiries";
const statuses = [
  "New",
  "Contacted",
  "Interested",
  "Follow-up Required",
  "Site Visit Booked",
  "Site Visit Completed",
  "Negotiation",
  "Booked / Won",
  "Not Interested / Lost",
];
const outcomes = [
  "Answered",
  "Not Answered",
  "Busy",
  "Switched Off / Unreachable",
  "Wrong Number",
  "Cancelled / Not Dialled",
];
const nav = [
  ["Dashboard", LayoutDashboard],
  ["Search", Search],
  ["Campaigns", Building2],
  ["Reports & Stats", ChartNoAxesCombined],
  ["Add Leads", Plus],
] as const;
const emptyLead = {
  name: "",
  phone: "",
  email: "",
  project: "",
  budget: "",
  bhk: "",
  location: "",
  source: "Manual",
  assignee: "",
  custom: {},
};
function Pick({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: any[];
  label: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="pick">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem
            key={typeof o === "string" ? o : o.value}
            value={typeof o === "string" ? o : o.value}
          >
            {typeof o === "string" ? o : o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
const fmt = (v: string | null) =>
  v
    ? new Date(v).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Not scheduled";
const local = (v: string | null) =>
  v
    ? new Date(new Date(v).getTime() - new Date(v).getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    : "";
const stamp = (v: string) => (v ? new Date(v).toISOString() : null);
const initials = (s: string) =>
  s
    .split(" ")
    .map((x) => x[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
const badge = (s: string) =>
  s.includes("Visit")
    ? "purple"
    : s.includes("Interested") || s.includes("Won")
      ? "green"
      : s.includes("Follow")
        ? "amber"
        : s.includes("Lost")
          ? "gray"
          : "blue";
export default function CRM() {
  const [assignmentCampaign,setAssignmentCampaign]=useState('');
  const [checkedLeads, setCheckedLeads] = useState<string[]>([]);
  const [trashQuery, setTrashQuery] = useState("");
  const [confirmation, setConfirmation] = useState<any>(null);
  const [confirmText, setConfirmText] = useState("");
  function requestDeletion(body: any, title: string, message: string, permanent = false) {
    setConfirmText("");
    setSelected(null);
    setConfirmation({ body, title, message, permanent });
  }
  const modalRef = useRef("");
  const [clientFilter, setClientFilter] = useState("all"),
    [projectFilter, setProjectFilter] = useState("all"),
    [campaignFilter, setCampaignFilter] = useState("all");
  const [categoryDraft, setCategoryDraft] = useState<any>({
    client_id: "",
    project_id: "",
    campaign_id: "",
  });
  const [categoryEdit, setCategoryEdit] = useState<any>({});
  const [catalog, setCatalog] = useState<any>({
    kind: "client",
    name: "",
    client_id: "",
    project_id: "",
  });
  const [password, setPassword] = useState(""),
    [currentPassword, setCurrentPassword] = useState(""),
    [resetId, setResetId] = useState(""),
    [page, setPage] = useState(1);
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [view, setView] = useState("Dashboard"),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("All statuses"),
    [owner, setOwner] = useState("All callers"),
    [period, setPeriod] = useState("7"),
    [selected, setSelected] = useState<any>(null),
    [modal, setModal] = useState(""),
    [busy, setBusy] = useState(false),
    [lead, setLead] = useState<any>({ ...emptyLead }),
    [update, setUpdate] = useState<any>({}),
    [field, setField] = useState<any>({
      name: "",
      type: "text",
      options: "",
      required: false,
      position: "0",
    }),
    [person, setPerson] = useState({ name: "", email: "", password: "" }),
    [columns, setColumns] = useState<string[]>([]),
    [sort, setSort] = useState("Recent"),
    [savedViews, setSavedViews] = useState<any[]>([]);
  const refresh = useCallback(async () => {
    const r = await fetch("/api/crm", { cache: "no-store" });
    const j: any = await r.json();
    if (r.status === 401) {
      window.location.assign("/login");
      throw new Error("Please sign in");
    }
    if (!r.ok) {
      if (r.status === 403) setData(null);
      throw new Error(j.error);
    }
    setData(j);
    setError("");
    return j;
  }, []);
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    try {
      setSavedViews(JSON.parse(localStorage.getItem("kefi-views") || "[]"));
      setColumns(JSON.parse(localStorage.getItem("kefi-columns") || "[]"));
    } catch {}
  }, [refresh]);
  useEffect(() => {
    modalRef.current = modal;
  }, [modal]);
  useEffect(() => {
    setPage(1);
  }, [query, filter, owner, sort, clientFilter, projectFilter, campaignFilter]);
  useEffect(() => {
    setCheckedLeads([]);
  }, [query, filter, owner, sort, clientFilter, projectFilter, campaignFilter, page, view, data]);
  useEffect(() => {
    setCategoryDraft({
      client_id: clientFilter === "all" ? "" : clientFilter,
      project_id: "",
      campaign_id: "",
    });
  }, [clientFilter]);
  function openUpdate(l: any, call = false) {
    setSelected(l);
    setUpdate({
      status: l.status,
      outcome: "",
      note: "",
      followup: local(l.followup),
      visit: local(l.visit),
    });
    setModal(call ? "call" : "update");
  }
  useEffect(() => {
    const check = () => {
      if (document.visibilityState === "visible" && !modalRef.current)
        refresh()
          .then((j) => {
            if (j.pending) {
              const l = j.leads.find((x: any) => x.id === j.pending.leadId);
              if (l) openUpdate(l, true);
            }
          })
          .catch(() => {});
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [refresh]);
  useEffect(() => {
    const context = (document as any).modelContext;
    if (!context?.registerTool) return;
    const abort = new AbortController();
    Promise.resolve(
      context.registerTool(
        {
          name: "search_leads",
          description:
            "Filter the visible leads list by name, phone, project or custom field. Does not modify lead records.",
          inputSchema: {
            type: "object",
            properties: { query: { type: "string" } },
            required: ["query"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          execute: (input: any) => {
            if (typeof input?.query !== "string")
              throw new Error("query must be text");
            setQuery(input.query);
            setView("Search");
            return { query: input.query, view: "Search" };
          },
        },
        { signal: abort.signal },
      ),
    ).catch(() => {});
    return () => abort.abort();
  }, []);
  async function post(body: any) {
    const r = await fetch("/api/crm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j: any = await r.json();
    if (!r.ok) throw new Error(j.error);
    return j;
  }
  async function save(body: any, done?: () => void) {
    setBusy(true);
    try {
      await post(body);
      await refresh();
      toast.success("Saved successfully");
      done?.();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function call(l: any) {
    setBusy(true);
    try {
      if (data.pending && data.pending.leadId !== l.id) {
        const old = data.leads.find((x: any) => x.id === data.pending.leadId);
        if (old) {
          openUpdate(old, true);
          toast.info("Finish the previous call update first");
          return;
        }
      }
      await post({ action: "startCall", id: l.id });
      setData((d: any) => ({ ...d, pending: { leadId: l.id } }));
      window.location.href = "tel:" + l.phone;
      setSelected(l);
      setUpdate({
        status: l.status,
        outcome: "",
        note: "",
        followup: local(l.followup),
        visit: local(l.visit),
      });
      setModal("call");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <main className="login">
        <div className="brandmark">N</div>
        <h1>NxtCall</h1>
        <p>{error || "Opening your workspace…"}</p>
        {error && (
          <button
            className="primary"
            onClick={() => refresh().catch((e) => setError(e.message))}
          >
            Try again
          </button>
        )}
        {error && <a href="/login">Back to sign in</a>}
      </main>
    );
  const isAdmin = data.user.role === "admin",
    allLeads = data.leads as any[],
    leads = allLeads.filter(
      (l) => clientFilter === "all" || l.client_id === clientFilter,
    ),
    users = data.users as any[],
    acts = (data.activities as any[]).filter(
      (a) => clientFilter === "all" || leads.some((l) => l.id === a.leadId),
    ),
    fields = data.fields as any[];
  const userName = (id: string) =>
    users.find((u) => u.id === id)?.name || "Caller";
  const today = new Date().toLocaleDateString("en-CA"),
    isToday = (v: string) =>
      v && new Date(v).toLocaleDateString("en-CA") === today;
  const overdue = leads.filter(
      (l) => l.followup && new Date(l.followup) < new Date(),
    ),
    due = leads.filter((l) => isToday(l.followup)),
    visits = leads
      .filter(
        (l) =>
          l.status === "Site Visit Booked" &&
          l.visit &&
          new Date(l.visit) >= new Date(),
      )
      .sort((a, b) => a.visit.localeCompare(b.visit));
  const metricEvents: any[] = (data.events || acts).filter(
    (a: any) =>
      (clientFilter === "all" ||
        a.client_id === clientFilter ||
        allLeads.some(
          (l) => l.id === a.leadId && l.client_id === clientFilter,
        )) &&
      new Date(a.created).getTime() >= Date.now() - Number(period) * 86400000,
  );
  const recent = acts.filter(
      (a) =>
        new Date(a.created).getTime() >= Date.now() - Number(period) * 86400000,
    ),
    calls = metricEvents.filter(
      (a: any) => a.type === "call" && a.outcome !== "Cancelled / Not Dialled",
    );
  const clients = data.clients || [],
    projects = data.projects || [],
    campaigns = data.campaigns || [];
  const categoryName = (items: any[], id: string) =>
    items.find((x: any) => x.id === id)?.name || "";
  const resetFilters = () => {
    setProjectFilter("all");
    setCampaignFilter("all");
    setFilter("All statuses");
    setOwner("All callers");
    setQuery("");
  };
  function categoryInputs(value: any, onChange: (next: any) => void) {
    return (
      <div className="form-grid category-inputs">
        <label>
          Client
          <Pick
            label="Client"
            value={value.client_id || "none"}
            onChange={(v) =>
              onChange({
                ...value,
                client_id: v === "none" ? "" : v,
                project_id: "",
                campaign_id: "",
              })
            }
            options={[
              { value: "none", label: "Uncategorised" },
              ...clients.map((x: any) => ({ value: x.id, label: x.name })),
            ]}
          />
        </label>
        <label>
          Project (optional)
          <Pick
            label="Project"
            value={value.project_id || "none"}
            onChange={(v) =>
              onChange({
                ...value,
                project_id: v === "none" ? "" : v,
                campaign_id: "",
              })
            }
            options={[
              { value: "none", label: "No project" },
              ...projects
                .filter((p: any) => p.client_id === value.client_id)
                .map((p: any) => ({ value: p.id, label: p.name })),
            ]}
          />
        </label>
        <label>
          Campaign / Ad Name (optional)
          <Pick
            label="Campaign / Ad Name"
            value={value.campaign_id || "none"}
            onChange={(v) =>
              onChange({ ...value, campaign_id: v === "none" ? "" : v })
            }
            options={[
              { value: "none", label: "No campaign / manual lead" },
              ...campaigns
                .filter(
                  (p: any) =>
                    p.client_id === value.client_id &&
                    (!p.project_id || p.project_id === value.project_id),
                )
                .map((p: any) => ({ value: p.id, label: p.name })),
            ]}
          />
        </label>
      </div>
    );
  }
  const list = leads
    .filter(
      (l) =>
        (filter === "All statuses" || filter === l.status) &&
        (owner === "All callers" || owner === l.assignee) &&
        (clientFilter === "all" || l.client_id === clientFilter) &&
        (projectFilter === "all" || l.project === projectFilter) &&
        (campaignFilter === "all" ||
          (campaignFilter === "none"
            ? !l.campaign_id
            : l.campaign_id === campaignFilter)) &&
        ([
          categoryName(clients, l.client_id),
          categoryName(campaigns, l.campaign_id),
          l.name,
          l.phone,
          l.project,
          l.location,
          ...Object.values(JSON.parse(l.custom || "{}")),
        ]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase()) ||
          (/^[+\d\s().-]+$/.test(query) &&
            query.replace(/\D/g, "").length > 0 &&
            l.phone.replace(/\D/g, "").includes(query.replace(/\D/g, "")))),
    )
    .sort((a, b) =>
      sort === "Name A–Z"
        ? a.name.localeCompare(b.name)
        : sort === "Follow-up first"
          ? (a.followup || "z").localeCompare(b.followup || "z")
          : b.updated.localeCompare(a.updated),
    );
  const current = selected
    ? allLeads.find((l) => l.id === selected.id) || selected
    : null;
  function showLeads(s = "All statuses") {
    resetFilters();
    setFilter(s);
    setView("Search");
  }
  function leadRows(items: any[]) {
    return (
      <Table className="lead-table">
        <TableHeader>
          <TableRow>
            {isAdmin && view === "Search" && <TableHead><input type="checkbox" aria-label="Select all leads on this page" disabled={busy} checked={items.length > 0 && items.every((l) => checkedLeads.includes(l.id))} onChange={(e) => setCheckedLeads(e.target.checked ? items.map((l) => l.id) : [])} /></TableHead>}
            <TableHead>Lead / contact</TableHead>
            <TableHead>Client / project</TableHead>
            <TableHead>Status</TableHead>
            {isAdmin && <TableHead>Assigned to</TableHead>}
            <TableHead>Next follow-up</TableHead>
            {fields
              .filter((f) => columns.includes(f.id))
              .map((f) => (
                <TableHead key={f.id}>{f.name}</TableHead>
              ))}
            <TableHead className="right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((l) => (
            <TableRow key={l.id}>
              {isAdmin && view === "Search" && <TableCell><input type="checkbox" aria-label={"Select " + l.name} disabled={busy} checked={checkedLeads.includes(l.id)} onChange={(e) => setCheckedLeads((ids) => e.target.checked ? [...ids, l.id] : ids.filter((id) => id !== l.id))} /></TableCell>}
              <TableCell>
                <button className="lead-name" onClick={() => setSelected(l)}>
                  <span className="avatar">{initials(l.name)}</span>
                  <span>
                    <strong>{l.name}</strong>
                    <small>{l.phone}</small>
                  </span>
                </button>
              </TableCell>
              <TableCell>
                <span>
                  {categoryName(clients, l.client_id) || "Uncategorised"} ·{" "}
                  {l.project}
                </span>
                <small>
                  {categoryName(campaigns, l.campaign_id) ||
                    "Manual / no campaign"}
                </small>
                <small>
                  {[l.bhk, l.budget].filter(Boolean).join(" · ") ||
                    "Requirements pending"}
                </small>
              </TableCell>
              <TableCell>
                <span className={"badge " + badge(l.status)}>{l.status}</span>
              </TableCell>
              {isAdmin && <TableCell>{userName(l.assignee)}</TableCell>}
              <TableCell>
                <span
                  className={
                    l.followup && new Date(l.followup) < new Date()
                      ? "overdue"
                      : ""
                  }
                >
                  {fmt(l.followup)}
                </span>
              </TableCell>
              {fields
                .filter((f) => columns.includes(f.id))
                .map((f) => (
                  <TableCell key={f.id}>
                    {String(JSON.parse(l.custom || "{}")[f.id] ?? "—")}
                  </TableCell>
                ))}
              <TableCell>
                <button
                  className="call-button"
                  aria-label={"Call " + l.name}
                  disabled={busy}
                  onClick={() => call(l)}
                >
                  <Phone size={16} />
                  <span>Call</span>
                </button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }
  function empty(title: string, body: string) {
    return (
      <div className="empty">
        <Building2 size={30} />
        <h3>{title}</h3>
        <p>{body}</p>
        <button className="secondary" onClick={() => setView("Add Leads")}>
          <Plus size={16} />
          Add your first lead
        </button>
      </div>
    );
  }
  function exportReport() {
    const rows = [
      [
        "Caller",
        "Logged calls",
        "Answered",
        "Unique leads contacted",
        "Site visits booked",
        "Won leads",
      ],
      ...users.map((u) => {
        const c = calls.filter((a: any) => a.userId === u.id);
        return [
          u.name,
          c.length,
          c.filter((a) => a.outcome === "Answered").length,
          new Set(
            c.filter((a) => a.outcome === "Answered").map((a: any) => a.leadId),
          ).size,
          leads.filter(
            (l) => l.assignee === u.id && l.status === "Site Visit Booked",
          ).length,
          leads.filter(
            (l) => l.assignee === u.id && l.status === "Booked / Won",
          ).length,
        ];
      }),
    ];
    const csv = rows
      .map((r) =>
        r
          .map(
            (v) =>
              '"' +
              String(v)
                .replace(/^[=+@-]/, "'")
                .replaceAll('"', '""') +
              '"',
          )
          .join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "caller-performance.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <SidebarProvider style={{ "--sidebar-width": "244px" } as any}>
      <Toaster position="top-right" />
      <Sidebar className="crm-sidebar">
        <SidebarHeader>
          <div className="brand">
            <div className="brandmark">N</div>
            <span>
              Nxt<span className="brand-light">Call</span>
              <small>SALES WORKSPACE</small>
            </span>
          </div>
          <div className="client-switcher">
            <label>
              CLIENT WORKSPACE
              <ImportSelect
                aria-label="Choose client workspace"
                value={clientFilter}
                onChange={(e) => {
                  setClientFilter(e.target.value);
                  setProjectFilter("all");
                  setCampaignFilter("all");
                  setSelected(null);
                  setCategoryDraft({
                    client_id: e.target.value === "all" ? "" : e.target.value,
                    project_id: "",
                    campaign_id: "",
                  });
                }}
              >
                <option value="all">All clients</option>
                {clients.map((cl: any) => (
                  <option key={cl.id} value={cl.id}>
                    {cl.name}
                  </option>
                ))}
              </ImportSelect>
            </label>
            {isAdmin && (
              <button
                onClick={() => {
                  setCatalog({
                    kind: "client",
                    name: "",
                    client_id: "",
                    project_id: "",
                  });
                  setModal("catalog");
                }}
              >
                + Add client
              </button>
            )}
          </div>
        </SidebarHeader>
        <SidebarContent>
          <div className="nav-label">WORKSPACE</div>
          <SidebarMenu>
            {nav.map(([label, Icon]) => (
              <SidebarMenuItem key={label}>
                <SidebarMenuButton
                  className="nav-item"
                  isActive={view === label}
                  onClick={() => setView(label)}
                >
                  <Icon />
                  <span>{label}</span>
                  {label === "Search" && (
                    <span className="nav-count">{leads.length}</span>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
            {isAdmin && <SidebarMenuItem><SidebarMenuButton className="nav-item" isActive={view === "Trash"} onClick={() => setView("Trash")}><Trash2 /><span>Trash</span><span className="nav-count">{(data.trash || []).filter((l: any) => clientFilter === "all" || l.client_id === clientFilter).length}</span></SidebarMenuButton></SidebarMenuItem>}
            {isAdmin && <SidebarMenuItem><SidebarMenuButton className="nav-item" isActive={view === "Assign leads"} onClick={()=>{setAssignmentCampaign('');setView('Assign leads');}}><Users/><span>Assign leads</span></SidebarMenuButton></SidebarMenuItem>}
          </SidebarMenu>
          <div className="sidebar-note">
            <div className="note-icon">
              <Building2 size={20} />
            </div>
            <strong>Every follow-up counts.</strong>
            <p>Your next conversation could be their next home.</p>
          </div>
        </SidebarContent>
        <SidebarFooter>
          <button
            className="manage-button"
            onClick={() => {
              setPassword("");
              setCurrentPassword("");
              setResetId("");
              setModal("password");
            }}
          >
            Change password
          </button>
          {isAdmin && (
            <button className="manage-button" onClick={() => setModal("users")}>
              <Users size={18} />
              Manage callers
            </button>
          )}
          <div className="profile">
            <span className="avatar accent">{initials(data.user.name)}</span>
            <div>
              <strong>{data.user.name}</strong>
              <small>
                {isAdmin ? "Administrator" : "Caller / Salesperson"}
              </small>
            </div>
            <button
              className="icon-btn"
              aria-label="Sign out"
              onClick={async () => {
                await fetch("/api/auth", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "logout" }),
                });
                window.location.assign("/login");
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="workspace">
        <header className="topbar">
          <div className="crumb">
            <SidebarTrigger />
            <span>
              {clientFilter === "all"
                ? "All clients"
                : categoryName(clients, clientFilter)}
            </span>
            <ChevronRight size={14} />
            <strong>{view}</strong>
          </div>
          <div className="top-right">
            <span className="date-label">
              {new Date().toLocaleDateString("en-IN", {
                weekday: "short",
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
            <button
              className="icon-btn"
              aria-label="Refresh data"
              onClick={() => refresh().catch((e) => toast.error(e.message))}
            >
              <RefreshCw size={17} />
            </button>
            <span className="avatar small-avatar">
              {initials(data.user.name)}
            </span>
          </div>
        </header>
        <main className="main" key={view}>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {isAdmin ? "THE BIG PICTURE" : "YOUR DAILY WORKSPACE"}
              </div>
              <h1>
                {view === "Dashboard"
                  ? isAdmin
                    ? `Your sales overview, ${data.user.name.split(" ")[0]}.`
                    : `Your day, ${data.user.name.split(" ")[0]}.`
                  : view === "Assign leads" ? "Assign client and campaign leads"
                  : view === "Trash"
                    ? "Deleted leads"
                  : view === "Campaigns"
                    ? "Campaigns & ads"
                    : view === "Search"
                      ? "Your lead workspace"
                      : view === "Reports & Stats"
                        ? "A clearer picture of performance"
                        : "Make the first connection."}
              </h1>
              <p>
                {view === "Dashboard"
                  ? "Keep conversations moving. Turn interest into a site visit."
                  : view === "Campaigns"
                    ? "Follow each campaign from enquiry to outcome."
                    : view === "Search"
                      ? "Every conversation, requirement and next step in one place."
                      : view === "Reports & Stats"
                        ? "Track activity, follow-through and real outcomes."
                        : "Add the details that help you start a better conversation."}
              </p>
            </div>
            {view !== "Add Leads" && (
              <button className="primary" onClick={() => setView("Add Leads")}>
                <Plus size={18} />
                Add lead
              </button>
            )}
          </div>
          {data.pending && (
            <button
              className="pending-banner"
              onClick={() => {
                const l = allLeads.find((l) => l.id === data.pending.leadId);
                if (l) openUpdate(l, true);
              }}
            >
              <Phone size={17} />
              You have a call waiting for an update.
              <span>Complete update →</span>
            </button>
          )}
          {view === "Dashboard" && !isAdmin && (
            <CallerDashboard
              data={{
                ...data,
                leads,
                activities: acts,
                events: (data.events || []).filter(
                  (a: any) =>
                    clientFilter === "all" ||
                    a.client_id === clientFilter ||
                    leads.some((l) => l.id === a.leadId),
                ),
              }}
              busy={busy}
              onCall={call}
              onOpen={setSelected}
              onUpdate={openUpdate}
            />
          )}
          {view === "Dashboard" && isAdmin && (
            <>
              <div className="stats-grid">
                {[
                  {
                    label: "Total leads",
                    value: leads.length,
                    sub: "In your workspace",
                    icon: Users,
                    style: "blue",
                    click: () => showLeads(),
                  },
                  {
                    label: "Follow-ups today",
                    value: due.length,
                    sub: `${overdue.length} overdue · needs attention`,
                    icon: Clock3,
                    style: "amber",
                    click: () => {
                      setModal("followups");
                    },
                  },
                  {
                    label: "Upcoming site visits",
                    value: visits.length,
                    sub: "The next step towards a home",
                    icon: Building2,
                    style: "purple",
                    click: () => showLeads("Site Visit Booked"),
                  },
                  {
                    label: "Booked / Won",
                    value: leads.filter((l) => l.status === "Booked / Won")
                      .length,
                    sub: "Conversations that converted",
                    icon: Check,
                    style: "green",
                    click: () => showLeads("Booked / Won"),
                  },
                ].map((c) => (
                  <button className="stat" key={c.label} onClick={c.click}>
                    <div className="stat-top">
                      <span>{c.label}</span>
                      <span className={"stat-icon " + c.style}>
                        <c.icon size={19} />
                      </span>
                    </div>
                    <strong>{c.value.toString().padStart(2, "0")}</strong>
                    <small>{c.sub}</small>
                  </button>
                ))}
              </div>
              <div className="dashboard-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Lead pipeline</h2>
                      <p>From first hello to a new home.</p>
                    </div>
                    <button className="text-button" onClick={() => showLeads()}>
                      View leads <ArrowUpRight size={16} />
                    </button>
                  </div>
                  <div className="pipeline">
                    {[
                      "New",
                      "Contacted",
                      "Interested",
                      "Site Visit Booked",
                      "Negotiation",
                      "Booked / Won",
                    ].map((s, i) => {
                      const count = leads.filter((l) => l.status === s).length;
                      return (
                        <button key={s} onClick={() => showLeads(s)}>
                          <div className="pipeline-bar">
                            <div
                              style={{
                                height: leads.length
                                  ? Math.max(5, (count / leads.length) * 100) +
                                    "%"
                                  : "5%",
                                background: [
                                  "#a6b8db",
                                  "#879fcc",
                                  "#9dacf0",
                                  "#7979c8",
                                  "#485e82",
                                  "#a1a500",
                                ][i],
                              }}
                            />
                          </div>
                          <strong>{count}</strong>
                          <span>
                            {s
                              .replace(" / Won", "")
                              .replace("Site Visit Booked", "Visit booked")}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="panel-foot">
                    <span>
                      {
                        leads.filter((l) =>
                          [
                            "Interested",
                            "Site Visit Booked",
                            "Negotiation",
                          ].includes(l.status),
                        ).length
                      }{" "}
                      leads showing buying intent
                    </span>
                    <span>Current status</span>
                  </div>
                </section>
                <section className="panel focus-panel">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">UP NEXT</span>
                      <h2>Follow-up focus</h2>
                    </div>
                    <Clock3 size={20} />
                  </div>
                  {[...leads.filter((l) => l.followup)]
                    .sort((a, b) => a.followup.localeCompare(b.followup))
                    .slice(0, 3)
                    .map((l) => (
                      <div className="focus-row" key={l.id}>
                        <span className="avatar">{initials(l.name)}</span>
                        <button onClick={() => setSelected(l)}>
                          <strong>{l.name}</strong>
                          <small
                            className={
                              new Date(l.followup) < new Date() ? "overdue" : ""
                            }
                          >
                            {fmt(l.followup)}
                          </small>
                        </button>
                        <button
                          className="icon-btn"
                          aria-label={"Call " + l.name}
                          onClick={() => call(l)}
                        >
                          <Phone size={17} />
                        </button>
                      </div>
                    ))}
                  {!leads.some((l) => l.followup) && (
                    <div className="focus-empty">
                      <CalendarDays size={30} />
                      <strong>A clear schedule.</strong>
                      <p>Schedule a follow-up from any lead to see it here.</p>
                    </div>
                  )}
                  <button
                    className="focus-footer"
                    onClick={() => setModal("followups")}
                  >
                    View all follow-ups <ChevronRight size={16} />
                  </button>
                </section>
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Recent leads</h2>
                    <p>Your latest opportunities, ready for the next step.</p>
                  </div>
                  <button className="text-button" onClick={() => showLeads()}>
                    View all <ArrowUpRight size={16} />
                  </button>
                </div>
                {leads.length
                  ? leadRows(leads.slice(0, 5))
                  : empty(
                      "Your next opportunity starts here",
                      "Add a lead or import your existing list to get moving.",
                    )}
              </section>
              <div className="bottom-note">
                All call outcomes are recorded by callers.{" "}
                <span>Built for better follow-through.</span>
              </div>
            </>
          )}
          {view === "Campaigns" && (
            <section className="panel campaigns-page">
              <div className="panel-heading">
                <div>
                  <h2>
                    {clientFilter === "all"
                      ? "All campaigns"
                      : categoryName(clients, clientFilter) + " campaigns"}
                  </h2>
                  <p>
                    {isAdmin
                      ? "Manage campaigns and optional projects."
                      : "Counts include only your assigned leads."}
                  </p>
                </div>
                {isAdmin && (
                  <div className="inline">
                    <button
                      className="secondary"
                      onClick={() => {
                        setCatalog({
                          kind: "project",
                          name: "",
                          client_id: clientFilter === "all" ? "" : clientFilter,
                          project_id: "",
                        });
                        setModal("catalog");
                      }}
                    >
                      + Project
                    </button>
                    <button
                      className="primary"
                      onClick={() => {
                        setCatalog({
                          kind: "campaign",
                          name: "",
                          client_id: clientFilter === "all" ? "" : clientFilter,
                          project_id: "",
                        });
                        setModal("catalog");
                      }}
                    >
                      + Campaign
                    </button>
                  </div>
                )}
              </div>
              <div className="campaign-grid">
                {campaigns
                  .filter(
                    (ca: any) =>
                      (clientFilter === "all" ||
                        ca.client_id === clientFilter) &&
                      (isAdmin || leads.some((l) => l.campaign_id === ca.id)),
                  )
                  .map((ca: any) => {
                    const rows = leads.filter((l) => l.campaign_id === ca.id);
                    return (
                      <article className="campaign-card" key={ca.id}>
                        <small>
                          {categoryName(clients, ca.client_id)} ·{" "}
                          {categoryName(projects, ca.project_id) ||
                            "Client-wide"}
                        </small>
                        <h3>{ca.name}</h3>
                        {isAdmin && <button className="secondary" onClick={()=>{setAssignmentCampaign(ca.id);setView('Assign leads');}}>Assign full campaign</button>}
                        <strong className="campaign-count">
                          {rows.length} leads
                        </strong>
                        <div className="campaign-statuses">
                          {statuses.map((s) => {
                            const count = rows.filter(
                              (l) => l.status === s,
                            ).length;
                            return count ? (
                              <span key={s}>
                                {s}: {count}
                              </span>
                            ) : null;
                          })}
                        </div>
                        <button
                          className="text-button"
                          onClick={() => {
                            resetFilters();
                            setCampaignFilter(ca.id);
                            setView("Search");
                          }}
                        >
                          View leads →
                        </button>
                        {isAdmin && <button className="text-button" disabled={busy} style={{ color: "#b42318", marginTop: 12 }} onClick={() => requestDeletion({ action: "deleteCampaign", id: ca.id }, "Delete campaign “" + ca.name + "”?", "This permanently removes the campaign. All linked leads, including leads in Trash, keep their client, project, notes and call history and move to Manual / no campaign. No leads will be deleted.", true)}>Delete campaign</button>}
                      </article>
                    );
                  })}
                <article className="campaign-card">
                  <small>Without a campaign</small>
                  <h3>Manual / Uncategorised</h3>
                  <strong className="campaign-count">
                    {leads.filter((l) => !l.campaign_id).length} leads
                  </strong>
                  <button
                    className="text-button"
                    onClick={() => {
                      resetFilters();
                      setCampaignFilter("none");
                      setView("Search");
                    }}
                  >
                    View leads →
                  </button>
                </article>
              </div>
            </section>
          )}
          {view === "Assign leads" && isAdmin && <BulkAssignment key={assignmentCampaign} initialCampaign={assignmentCampaign} clients={clients} campaigns={campaigns} users={users} post={post} onSaved={refresh}/>}
          {view === "Search" && (
            <section className="panel">
              {isAdmin && checkedLeads.length > 0 && <div className="list-meta" role="status"><span>{checkedLeads.length} leads selected on this page</span><button className="secondary" disabled={busy} onClick={() => requestDeletion({ action: "trashLeads", ids: checkedLeads }, "Delete " + checkedLeads.length + " leads?", "Move these selected leads to Trash? They will disappear from caller lists, dashboards and reports. An admin can restore them later.")}>Delete selected</button></div>}
              <div className="category-filters">
                <Pick
                  label="Filter project"
                  value={projectFilter}
                  onChange={(v) => {
                    setProjectFilter(v);
                    setCampaignFilter("all");
                  }}
                  options={[
                    { value: "all", label: "All projects" },
                    ...Array.from(
                      new Set(
                        leads
                          .filter(
                            (l) =>
                              clientFilter === "all" ||
                              l.client_id === clientFilter,
                          )
                          .map((l) => l.project),
                      ),
                    )
                      .filter(Boolean)
                      .map((p) => ({ value: p, label: p })),
                  ]}
                />
                <Pick
                  label="Filter campaign / ad"
                  value={campaignFilter}
                  onChange={setCampaignFilter}
                  options={[
                    { value: "all", label: "All campaigns / ads" },
                    { value: "none", label: "No campaign / manual" },
                    ...campaigns
                      .filter(
                        (x: any) =>
                          (clientFilter === "all" ||
                            x.client_id === clientFilter) &&
                          (projectFilter === "all" ||
                            !x.project_id ||
                            categoryName(projects, x.project_id) ===
                              projectFilter),
                      )
                      .map((x: any) => ({
                        value: x.id,
                        label:
                          x.name + " · " + categoryName(clients, x.client_id),
                      })),
                  ]}
                />
                <button className="text-button" onClick={resetFilters}>
                  Clear search filters
                </button>
              </div>
              <div className="search-toolbar">
                <div className="search-input">
                  <Search size={18} />
                  <input
                    aria-label="Search leads"
                    placeholder="Search name, phone, project or custom fields…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <Pick
                  label="Filter status"
                  value={filter}
                  onChange={setFilter}
                  options={["All statuses", ...statuses]}
                />
                {isAdmin && (
                  <Pick
                    label="Filter caller"
                    value={owner}
                    onChange={setOwner}
                    options={[
                      "All callers",
                      ...users.map((u) => ({ value: u.id, label: u.name })),
                    ]}
                  />
                )}
                <button
                  className="secondary"
                  onClick={() => setModal("columns")}
                >
                  <SlidersHorizontal size={16} />
                  Columns
                </button>
              </div>
              <div className="list-meta">
                <span>{list.length} leads found</span>
                <div className="inline">
                  <button
                    className="text-button"
                    onClick={() => {
                      const next = [
                        ...savedViews,
                        {
                          name: query || filter,
                          query,
                          filter,
                          owner,
                          clientFilter,
                          projectFilter,
                          campaignFilter,
                        },
                      ].slice(-8);
                      setSavedViews(next);
                      localStorage.setItem("kefi-views", JSON.stringify(next));
                      toast.success("View saved on this device");
                    }}
                  >
                    Save view
                  </button>
                  <Pick
                    label="Sort leads"
                    value={sort}
                    onChange={setSort}
                    options={["Recent", "Name A–Z", "Follow-up first"]}
                  />
                </div>
              </div>
              {savedViews.length > 0 && (
                <div className="saved-views">
                  {savedViews.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setQuery(s.query);
                        setFilter(s.filter);
                        setOwner(s.owner);
                        setClientFilter(s.clientFilter || "all");
                        setProjectFilter(s.projectFilter || "all");
                        setCampaignFilter(s.campaignFilter || "all");
                      }}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
              {list.length ? (
                <>
                  {leadRows(list.slice((page - 1) * 50, page * 50))}
                  <div className="list-meta">
                    <button
                      className="secondary"
                      disabled={page === 1}
                      onClick={() => setPage(page - 1)}
                    >
                      Previous
                    </button>
                    <span>
                      Page {page} of {Math.max(1, Math.ceil(list.length / 50))}
                    </span>
                    <button
                      className="secondary"
                      disabled={page * 50 >= list.length}
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                    </button>
                  </div>
                </>
              ) : (
                <div className="empty">
                  <Search size={28} />
                  <h3>No leads found</h3>
                  <p>Try another search or add a new lead.</p>
                </div>
              )}
            </section>
          )}
          {view === "Trash" && isAdmin && <section className="panel" style={{ padding: 20 }}>
            <h2>Trash</h2>
            <p>Restore deleted leads or permanently remove them and their notes and call history. Phone numbers remain reserved while leads are in Trash.</p>
            <input aria-label="Search Trash by name or phone" placeholder="Search deleted leads by name or phone…" value={trashQuery} onChange={(e) => setTrashQuery(e.target.value)} style={{ width: "100%", margin: "16px 0" }} />
            {(data.trash || []).filter((l: any) => (clientFilter === "all" || l.client_id === clientFilter) && (l.name + " " + l.phone).toLowerCase().includes(trashQuery.toLowerCase())).map((l: any) => <article key={l.id} style={{ borderTop: "1px solid #e2e8f0", padding: "16px 0", display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "space-between", alignItems: "center" }}>
              <div><strong>{l.name}</strong><p>{l.phone} · {categoryName(clients, l.client_id)}</p><small>Deleted {fmt(l.deleted_at)}</small></div>
              <div className="inline" style={{ flexWrap: "wrap" }}>
                <button className="secondary" disabled={busy} onClick={() => requestDeletion({ action: "restoreLeads", ids: [l.id] }, "Restore “" + l.name + "”?", "Restore this lead to its assigned caller with its notes, history and previous follow-up dates. Past follow-ups may appear overdue.")}>Restore</button>
                <button className="secondary" disabled={busy} style={{ color: "#b42318" }} onClick={() => requestDeletion({ action: "purgeLeads", ids: [l.id] }, "Permanently delete “" + l.name + "”?", "This removes the lead and all its notes and call history. This cannot be undone.", true)}>Delete permanently</button>
              </div>
            </article>)}
            {!(data.trash || []).some((l: any) => (clientFilter === "all" || l.client_id === clientFilter) && (l.name + " " + l.phone).toLowerCase().includes(trashQuery.toLowerCase())) && <p>No deleted leads found.</p>}
          </section>}
          {view === "Reports & Stats" && (
            <>
              <div className="report-toolbar">
                <span>
                  Call activity is filtered by period. Pipeline totals show
                  current lead status.
                </span>
                <Pick
                  label="Reporting period"
                  value={period}
                  onChange={setPeriod}
                  options={[
                    { value: "1", label: "Last 24 hours" },
                    { value: "7", label: "Last 7 days" },
                    { value: "30", label: "Last 30 days" },
                  ]}
                />
                <button className="secondary" onClick={exportReport}>
                  <ArrowDownToLine size={16} />
                  Export CSV
                </button>
              </div>
              <div className="stats-grid">
                {[
                  ["Logged calls", calls.length],
                  [
                    "Answered",
                    calls.filter((a: any) => a.outcome === "Answered").length,
                  ],
                  [
                    "Unique leads contacted",
                    new Set(
                      calls
                        .filter((a: any) => a.outcome === "Answered")
                        .map((a: any) => a.leadId),
                    ).size,
                  ],
                  [
                    "Updates & notes",
                    metricEvents.filter((a: any) => a.type === "update").length,
                  ],
                ].map(([l, v]) => (
                  <div className="stat" key={l}>
                    <span>{l}</span>
                    <strong>{v}</strong>
                    <small>Selected reporting period</small>
                  </div>
                ))}
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>
                      {isAdmin ? "Caller performance" : "Your performance"}
                    </h2>
                    <p>Activity that moves your leads forward.</p>
                  </div>
                  <ChartNoAxesCombined size={22} />
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      {[
                        "Caller",
                        "Logged calls",
                        "Answered",
                        "Visits booked",
                        "Won leads",
                        "Overdue follow-ups",
                      ].map((h) => (
                        <TableHead key={h}>{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div className="inline">
                            <span className="avatar">{initials(u.name)}</span>
                            <strong>{u.name}</strong>
                          </div>
                        </TableCell>
                        <TableCell>
                          {calls.filter((a: any) => a.userId === u.id).length}
                        </TableCell>
                        <TableCell>
                          {
                            calls.filter(
                              (a: any) =>
                                a.userId === u.id && a.outcome === "Answered",
                            ).length
                          }
                        </TableCell>
                        <TableCell>
                          {
                            leads.filter(
                              (l) =>
                                l.assignee === u.id &&
                                l.status === "Site Visit Booked",
                            ).length
                          }
                        </TableCell>
                        <TableCell>
                          {
                            leads.filter(
                              (l) =>
                                l.assignee === u.id &&
                                l.status === "Booked / Won",
                            ).length
                          }
                        </TableCell>
                        <TableCell>
                          <span className="overdue">
                            {overdue.filter((l) => l.assignee === u.id).length}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </section>
              <section className="panel activity-panel">
                <div className="panel-heading">
                  <h2>Recent activity</h2>
                </div>
                {recent.length ? (
                  recent.slice(0, 20).map((a) => (
                    <div className="activity" key={a.id}>
                      <span className="activity-dot" />
                      <div>
                        <strong>
                          {userName(a.userId)} · {a.outcome || a.type}
                        </strong>
                        <p>
                          {leads.find((l) => l.id === a.leadId)?.name}{" "}
                          {a.note && "— " + a.note}
                        </p>
                        <small>{fmt(a.created)}</small>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="empty">
                    <p>Saved call updates and notes will appear here.</p>
                  </div>
                )}
              </section>
            </>
          )}
          {view === "Add Leads" && (
            <div className="add-layout">
              <section className="panel form-panel">
                {isAdmin && (
                  <button
                    className="secondary"
                    style={{ marginBottom: 16 }}
                    onClick={() => setModal("fields")}
                  >
                    <SlidersHorizontal size={16} />
                    Manage custom fields
                  </button>
                )}
                <h2>Client & campaign</h2>
                <p className="scope-label">
                  Selected workspace:{" "}
                  <strong>
                    {clientFilter === "all"
                      ? "All clients — choose a client before importing"
                      : categoryName(clients, clientFilter)}
                  </strong>
                </p>
                <p className="category-help">
                  Campaigns and leads stay connected to their selected client.
                </p>
                {isAdmin && (
                  <button
                    className="secondary"
                    onClick={() => setModal("catalog")}
                  >
                    <Plus size={16} />
                    Manage clients & campaigns
                  </button>
                )}
                <Tabs defaultValue="single">
                  <TabsList>
                    <TabsTrigger value="single">Add a lead</TabsTrigger>
                    <TabsTrigger value="import">Import CSV</TabsTrigger>
                  </TabsList>
                  <TabsContent value="single">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        save(
                          {
                            action: "lead",
                            lead: {
                              ...lead,
                              ...categoryDraft,
                              client_id:
                                clientFilter === "all"
                                  ? categoryDraft.client_id
                                  : clientFilter,
                            },
                          },
                          () => {
                            setLead({ ...emptyLead, custom: {} });
                            setView("Search");
                          },
                        );
                      }}
                    >
                      {categoryInputs(
                        {
                          ...categoryDraft,
                          client_id:
                            clientFilter === "all"
                              ? categoryDraft.client_id
                              : clientFilter,
                        },
                        (next) => {
                          setCategoryDraft(next);
                          if (
                            clientFilter !== "all" &&
                            next.client_id !== clientFilter
                          ) {
                            setClientFilter(next.client_id || "all");
                            setProjectFilter("all");
                            setCampaignFilter("all");
                          }
                        },
                      )}
                      <h2>Contact details</h2>
                      <div className="form-grid">
                        {[
                          ["name", "Full name", "e.g. Ankit Sharma"],
                          ["phone", "Phone number", "e.g. 9876543210"],
                          ["email", "Email address", "Optional"],
                        ].map(([k, label, placeholder]) => (
                          <label key={k}>
                            {label}
                            {["name", "phone"].includes(k) && " *"}
                            <input
                              required={["name", "phone"].includes(k)}
                              type={
                                k === "email"
                                  ? "email"
                                  : k === "phone"
                                    ? "tel"
                                    : "text"
                              }
                              value={lead[k]}
                              placeholder={placeholder}
                              onChange={(e) =>
                                setLead({ ...lead, [k]: e.target.value })
                              }
                            />
                          </label>
                        ))}
                      </div>
                      <h2>Property requirements</h2>
                      <div className="form-grid">
                        {[
                          ["budget", "Budget", "e.g. ₹70–90 lakh"],
                          ["bhk", "Configuration", "e.g. 3 BHK"],
                          ["location", "Preferred location", "e.g. Kanke Road"],
                        ].map(([k, label, placeholder]) => (
                          <label key={k}>
                            {label}
                            <input
                              value={lead[k]}
                              placeholder={placeholder}
                              onChange={(e) =>
                                setLead({ ...lead, [k]: e.target.value })
                              }
                            />
                          </label>
                        ))}
                        <label>
                          Lead source
                          <Pick
                            label="Lead source"
                            value={lead.source}
                            onChange={(v) => setLead({ ...lead, source: v })}
                            options={[
                              "Manual",
                              "Facebook / Instagram",
                              "Website",
                              "Referral",
                              "Walk-in",
                              "Property portal",
                              "Other",
                            ]}
                          />
                        </label>
                        {isAdmin && (
                          <label>
                            Assigned to
                            <Pick
                              label="Assign caller"
                              value={lead.assignee || data.user.id}
                              onChange={(v) =>
                                setLead({ ...lead, assignee: v })
                              }
                              options={users
                                .filter((u) => u.active)
                                .map((u) => ({ value: u.id, label: u.name }))}
                            />
                          </label>
                        )}
                      </div>
                      {fields.length > 0 && (
                        <>
                          <h2>Additional details</h2>
                          <div className="form-grid">
                            {fields.map((f) => (
                              <label key={f.id}>
                                {f.name}
                                {f.required ? " *" : ""}
                                {f.type === "dropdown" ? (
                                  <Pick
                                    label={f.name}
                                    value={lead.custom[f.id] || ""}
                                    onChange={(v) =>
                                      setLead({
                                        ...lead,
                                        custom: { ...lead.custom, [f.id]: v },
                                      })
                                    }
                                    options={JSON.parse(f.options)}
                                  />
                                ) : f.type === "checkbox" ? (
                                  <Checkbox
                                    checked={!!lead.custom[f.id]}
                                    onCheckedChange={(v) =>
                                      setLead({
                                        ...lead,
                                        custom: {
                                          ...lead.custom,
                                          [f.id]: v === true,
                                        },
                                      })
                                    }
                                  />
                                ) : f.type === "multi-select" ? (
                                  <div className="checks">
                                    {JSON.parse(f.options).map((o: string) => (
                                      <label className="check-row" key={o}>
                                        <Checkbox
                                          checked={(
                                            lead.custom[f.id] || []
                                          ).includes(o)}
                                          onCheckedChange={(v) =>
                                            setLead({
                                              ...lead,
                                              custom: {
                                                ...lead.custom,
                                                [f.id]: v
                                                  ? [
                                                      ...(lead.custom[f.id] ||
                                                        []),
                                                      o,
                                                    ]
                                                  : (
                                                      lead.custom[f.id] || []
                                                    ).filter(
                                                      (x: string) => x !== o,
                                                    ),
                                              },
                                            })
                                          }
                                        />
                                        {o}
                                      </label>
                                    ))}
                                  </div>
                                ) : (
                                  <input
                                    type={f.type}
                                    required={!!f.required}
                                    value={lead.custom[f.id] || ""}
                                    onChange={(e) =>
                                      setLead({
                                        ...lead,
                                        custom: {
                                          ...lead.custom,
                                          [f.id]: e.target.value,
                                        },
                                      })
                                    }
                                  />
                                )}
                              </label>
                            ))}
                          </div>
                        </>
                      )}
                      <div className="form-actions">
                        <span>* Required fields</span>
                        <button className="primary" disabled={busy}>
                          <Plus size={17} />
                          {busy ? "Saving…" : "Save lead"}
                        </button>
                      </div>
                    </form>
                  </TabsContent>
                  <TabsContent value="import">
                    <LeadImport
                      clients={clients}
                      onSelectClient={(id) => {
                        setClientFilter(id);
                        setProjectFilter("all");
                        setCampaignFilter("all");
                      }}
                      client={clients.find((cl: any) => cl.id === clientFilter)}
                      campaigns={campaigns}
                      projects={projects}
                      fields={fields}
                      existing={[...allLeads,...(isAdmin ? data.trash || [] : [])]}
                      onViewLead={(l)=>setSelected(l)}
                      isAdmin={isAdmin}
                      onCreate={async (body) => {
                        const result = await post(body);
                        const fresh = await refresh();
                        return { ...result, fields: fresh.fields };
                      }}
                      onImport={async (rows) => {
                        await post({ action: "import", rows });
                        await refresh();
                        toast.success(rows.length + " leads imported");
                      }}
                    />
                  </TabsContent>
                </Tabs>
              </section>
              <aside className="add-aside">
                <div className="panel">
                  <SlidersHorizontal size={25} />
                  <h2>Your data, your way.</h2>
                  <p>
                    Add fields for purchase timelines, financing, family
                    preferences or anything your conversations need.
                  </p>
                  {isAdmin ? (
                    <button
                      className="secondary"
                      onClick={() => setModal("fields")}
                    >
                      <Plus size={16} />
                      Manage custom fields
                    </button>
                  ) : (
                    <p>Ask your admin to add custom fields.</p>
                  )}
                </div>
                <div className="tip">
                  <Check size={18} />
                  <p>
                    Phone numbers are checked for duplicates to keep your
                    workspace organised.
                  </p>
                </div>
              </aside>
            </div>
          )}
        </main>
        <nav className="mobile-nav">
          {nav.map(([label, Icon]) => (
            <button
              key={label}
              className={view === label ? "active" : ""}
              onClick={() => setView(label)}
            >
              <Icon size={20} />
              <span>{label === "Reports & Stats" ? "Reports" : label}</span>
            </button>
          ))}
        </nav>
      </SidebarInset>
      <Dialog open={!!confirmation && isAdmin} onOpenChange={(open) => { if (!open && !busy) setConfirmation(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{confirmation?.title}</DialogTitle><DialogDescription>{confirmation?.message}</DialogDescription></DialogHeader>
          {confirmation?.permanent && <label>Type DELETE to confirm<input aria-label="Type DELETE to confirm" autoComplete="off" value={confirmText} disabled={busy} onChange={(e) => setConfirmText(e.target.value)} style={{ display: "block", width: "100%", marginTop: 8 }} /></label>}
          <div className="inline" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button className="secondary" disabled={busy} onClick={() => setConfirmation(null)}>Cancel</button>
            <button className="primary" disabled={busy || (confirmation?.permanent && confirmText !== "DELETE")} onClick={() => save(confirmation.body, () => { if (confirmation.body.action === "deleteCampaign") setCampaignFilter("all"); setConfirmation(null); setCheckedLeads([]); })}>{busy ? "Saving…" : confirmation?.body.action === "restoreLeads" ? "Restore lead" : confirmation?.permanent ? "Delete permanently" : "Move to Trash"}</button>
          </div>
        </DialogContent>
      </Dialog>
      <Sheet
        open={!!selected && !modal}
        onOpenChange={(v) => !v && setSelected(null)}
      >
        <SheetContent className="lead-sheet">
          <SheetHeader>
            <SheetTitle>{current?.name}</SheetTitle>
            <SheetDescription>
              {current?.project} · {current?.phone}
            </SheetDescription>
          </SheetHeader>
          {current && (
            <div className="sheet-body">
              <span className={"badge " + badge(current.status)}>
                {current.status}
              </span>
              <div className="sheet-actions">
                {isAdmin && <button className="secondary" disabled={busy} style={{ color: "#b42318" }} onClick={() => requestDeletion({ action: "trashLeads", ids: [current.id] }, "Delete “" + current.name + "”?", "Move this lead to Trash? An admin can restore it later. It will disappear from active lists and reports.")}>Delete lead</button>}
                <button className="primary" onClick={() => call(current)}>
                  <Phone size={17} />
                  Call lead
                </button>
                <button
                  className="secondary"
                  onClick={() => openUpdate(current)}
                >
                  Update & add note
                </button>
              </div>
              <div className="detail-grid">
                <section style={{gridColumn:'1 / -1'}}>
                  <h3>Related enquiries</h3>
                  <p>Other accessible records using this phone number.</p>
                  {[...allLeads,...(isAdmin?data.trash || []:[])].filter(l=>l.id!==current.id && phoneKey(l.phone)===phoneKey(current.phone)).map(l=><div key={l.id} style={{padding:'12px 0',borderBottom:'1px solid #e2e8f0'}}>
                    <strong>{categoryName(clients,l.client_id)} · {l.project || 'No project'}</strong>
                    <p>{categoryName(campaigns,l.campaign_id) || 'Manual / no campaign'} · {l.status} · {userName(l.assignee)}{l.deleted_at?' · In Trash':''}</p>
                    {!l.deleted_at && <button className="text-button" onClick={()=>setSelected(l)}>Open enquiry</button>}
                  </div>)}
                  {![...allLeads,...(isAdmin?data.trash || []:[])].some(l=>l.id!==current.id && phoneKey(l.phone)===phoneKey(current.phone)) && <p>No other accessible enquiries.</p>}
                </section>
                {[
                  ["Budget", current.budget],
                  ["Configuration", current.bhk],
                  ["Location", current.location],
                  ["Source", current.source],
                  ["Follow-up", fmt(current.followup)],
                  ["Site visit", fmt(current.visit)],
                  ...fields.map((f) => [
                    f.name,
                    String(JSON.parse(current.custom || "{}")[f.id] ?? "—"),
                  ]),
                ].map(([k, v]) => (
                  <div key={k}>
                    <small>{k}</small>
                    <strong>{v || "Not specified"}</strong>
                  </div>
                ))}
              </div>
              {isAdmin && (
                <label>
                  Assigned caller
                  <Pick
                    label="Reassign lead"
                    value={current.assignee}
                    onChange={(v) =>
                      save({ action: "assign", id: current.id, assignee: v })
                    }
                    options={users
                      .filter((u) => u.active)
                      .map((u) => ({ value: u.id, label: u.name }))}
                  />
                </label>
              )}
              <div className="lead-classification">
                <small>Client / Campaign</small>
                <strong>
                  {categoryName(clients, current.client_id) || "Uncategorised"}{" "}
                  ·{" "}
                  {categoryName(campaigns, current.campaign_id) ||
                    "No campaign"}
                </strong>
                {isAdmin && (
                  <button
                    className="secondary"
                    onClick={() => {
                      setCategoryEdit({
                        client_id: current.client_id || "",
                        project_id: current.project_id || "",
                        campaign_id: current.campaign_id || "",
                      });
                      setModal("categorize");
                    }}
                  >
                    Set client / campaign
                  </button>
                )}
              </div>
              <h2>Conversation history</h2>
              {acts
                .filter((a) => a.leadId === current.id)
                .map((a) => (
                  <div className="activity" key={a.id}>
                    <span className="activity-dot" />
                    <div>
                      <strong>
                        {a.outcome || a.status || "Lead reassigned"}
                      </strong>
                      <p>{a.note || "No note added"}</p>
                      <small>
                        {userName(a.userId)} · {fmt(a.created)}
                      </small>
                    </div>
                  </div>
                ))}
              <div className="activity">
                <span className="activity-dot" />
                <div>
                  <strong>Lead added</strong>
                  <small>{fmt(current.created)}</small>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
      <Dialog
        open={!!modal}
        onOpenChange={(v) => {
          if (!v) setModal("");
        }}
      >
        <DialogContent className="crm-dialog">
          <DialogHeader>
            <DialogTitle>
              {
                (
                  {
                    password: "Change password",
                    catalog: "Clients, projects & campaigns",
                    categorize: "Categorise lead",
                    call: "How did the conversation go?",
                    update: "Update lead",
                    users: "Manage callers",
                    fields: "Custom fields",
                    columns: "Visible custom columns",
                    followups: "Follow-ups",
                  } as any
                )[modal]
              }
            </DialogTitle>
            <DialogDescription>
              {modal === "password"
                ? "Change password"
                : modal === "call"
                  ? `${current?.name || ""} · Log the outcome and plan the next step.`
                  : modal === "users"
                    ? "Create a login email and initial password. Share the credentials privately with your caller."
                    : modal === "fields"
                      ? "Create reusable fields for every lead. Position controls their order."
                      : "Keep your lead workspace up to date."}
            </DialogDescription>
          </DialogHeader>
          {["call", "update"].includes(modal) && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (modal === "call" && !update.outcome) {
                  toast.error("Select a call outcome");
                  return;
                }
                save(
                  {
                    action: "update",
                    id: current.id,
                    ...update,
                    followup: stamp(update.followup),
                    visit: stamp(update.visit),
                  },
                  () => {
                    setModal("");
                    setSelected(null);
                  },
                );
              }}
            >
              {modal === "call" && (
                <label>
                  Call outcome *
                  <Pick
                    label="Call outcome"
                    value={update.outcome}
                    onChange={(v) => setUpdate({ ...update, outcome: v })}
                    options={outcomes}
                  />
                </label>
              )}
              <label>
                Lead status
                <Pick
                  label="Lead status"
                  value={update.status}
                  onChange={(v) => setUpdate({ ...update, status: v })}
                  options={statuses}
                />
              </label>
              <div className="form-grid">
                <label>
                  Next follow-up
                  <input
                    type="datetime-local"
                    value={update.followup || ""}
                    onChange={(e) =>
                      setUpdate({ ...update, followup: e.target.value })
                    }
                  />
                </label>
                <label>
                  Site visit
                  <input
                    type="datetime-local"
                    value={update.visit || ""}
                    onChange={(e) =>
                      setUpdate({ ...update, visit: e.target.value })
                    }
                  />
                </label>
              </div>
              <div className="quick-dates">
                {["Later today", "Tomorrow", "In 3 days"].map((s, i) => (
                  <button
                    type="button"
                    key={s}
                    onClick={() =>
                      setUpdate({
                        ...update,
                        followup: local(
                          new Date(
                            Date.now() + [7200000, 86400000, 259200000][i],
                          ).toISOString(),
                        ),
                      })
                    }
                  >
                    {s}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setUpdate({ ...update, followup: "" })}
                >
                  Clear follow-up
                </button>
              </div>
              <label>
                What did the lead say?
                <textarea
                  rows={4}
                  placeholder="Requirements, objections and the next step…"
                  value={update.note || ""}
                  onChange={(e) =>
                    setUpdate({ ...update, note: e.target.value })
                  }
                />
              </label>
              <button disabled={busy} className="primary wide">
                {busy ? "Saving…" : "Save update"}
              </button>
            </form>
          )}
          {modal === "users" && isAdmin && (
            <>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  save({ action: "user", ...person }, () =>
                    setPerson({ name: "", email: "", password: "" }),
                  );
                }}
              >
                <div className="form-grid">
                  <label>
                    Full name
                    <input
                      required
                      value={person.name}
                      onChange={(e) =>
                        setPerson({ ...person, name: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Login email
                    <input
                      required
                      type="email"
                      value={person.email}
                      onChange={(e) =>
                        setPerson({ ...person, email: e.target.value })
                      }
                    />
                  </label>
                </div>
                <label>
                  Initial password (12+ characters)
                  <input
                    required
                    type="password"
                    minLength={12}
                    maxLength={128}
                    autoComplete="new-password"
                    value={person.password}
                    onChange={(e) =>
                      setPerson({ ...person, password: e.target.value })
                    }
                  />
                </label>
                <button className="primary" disabled={busy}>
                  <Plus size={16} />
                  Add caller
                </button>
              </form>
              <div className="user-list">
                {users.map((u) => (
                  <div className="user-row" key={u.id}>
                    <span className="avatar">{initials(u.name)}</span>
                    <div>
                      <strong>{u.name}</strong>
                      <small>
                        {u.email} · {u.role}
                      </small>
                    </div>
                    {u.role === "caller" && (
                      <button
                        className="text-button"
                        onClick={() => {
                          setResetId(u.id);
                          setPassword("");
                          setModal("password");
                        }}
                      >
                        Reset password
                      </button>
                    )}
                    {u.role === "caller" && (
                      <button
                        disabled={busy}
                        className="text-button"
                        onClick={() =>
                          save({
                            action: "toggleUser",
                            id: u.id,
                            active: !u.active,
                          })
                        }
                      >
                        {u.active ? "Disable" : "Enable"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
          {modal === "password" && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  if (resetId) {
                    await post({
                      action: "resetPassword",
                      id: resetId,
                      password,
                    });
                  } else {
                    const r = await fetch("/api/auth", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        action: "password",
                        password,
                        currentPassword,
                      }),
                    });
                    const j = await r.json();
                    if (!r.ok) throw new Error(j.error);
                  }
                  toast.success("Password changed");
                  setPassword("");
                  setCurrentPassword("");
                  setModal(resetId ? "users" : "");
                } catch (e) {
                  toast.error(
                    e instanceof Error
                      ? e.message
                      : "Unable to change password",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {!resetId && (
                <label>
                  Current password
                  <input
                    required
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </label>
              )}
              <label>
                New password
                <input
                  required
                  type="password"
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <button className="primary wide" disabled={busy}>
                Save password
              </button>
            </form>
          )}
          {modal === "fields" && isAdmin && (
            <>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  save(
                    {
                      action: "field",
                      ...field,
                      options: field.options
                        .split(",")
                        .map((s: string) => s.trim())
                        .filter(Boolean),
                    },
                    () =>
                      setField({
                        name: "",
                        type: "text",
                        options: "",
                        required: false,
                        position: "0",
                      }),
                  );
                }}
              >
                <div className="form-grid">
                  <label>
                    Field name
                    <input
                      required
                      placeholder="e.g. Purchase timeline"
                      value={field.name}
                      onChange={(e) =>
                        setField({ ...field, name: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Field type
                    <Pick
                      label="Field type"
                      value={field.type}
                      onChange={(v) => setField({ ...field, type: v })}
                      options={[
                        "text",
                        "number",
                        "date",
                        "dropdown",
                        "multi-select",
                        "checkbox",
                      ]}
                    />
                  </label>
                </div>
                {["dropdown", "multi-select"].includes(field.type) && (
                  <label>
                    Options, separated by commas
                    <input
                      required
                      placeholder="Immediately, 3 months, 6 months"
                      value={field.options}
                      onChange={(e) =>
                        setField({ ...field, options: e.target.value })
                      }
                    />
                  </label>
                )}
                <label>
                  Display position
                  <input
                    type="number"
                    value={field.position}
                    onChange={(e) =>
                      setField({ ...field, position: e.target.value })
                    }
                  />
                </label>
                <label className="check-row">
                  <Checkbox
                    checked={field.required}
                    onCheckedChange={(v) =>
                      setField({ ...field, required: v === true })
                    }
                  />
                  Required for new leads
                </label>
                <button disabled={busy} className="primary">
                  <Plus size={16} />
                  Create field
                </button>
              </form>
              <div className="field-list">
                {fields.map((f) => (
                  <div key={f.id}>
                    <strong>{f.name}</strong>
                    <small>
                      {f.type} · Position {f.position}
                      {f.required ? " · Required" : ""}
                    </small>
                  </div>
                ))}
              </div>
            </>
          )}
          {modal === "categorize" && isAdmin && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save(
                  { action: "categorize", id: current.id, ...categoryEdit },
                  () => setModal(""),
                );
              }}
            >
              {categoryInputs(categoryEdit, setCategoryEdit)}
              <button className="primary" disabled={busy}>
                Save categories
              </button>
            </form>
          )}
          {modal === "catalog" && isAdmin && (
            <>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  save({ action: "catalog", ...catalog }, () =>
                    setCatalog({ ...catalog, name: "" }),
                  );
                }}
              >
                <label>
                  Add
                  <Pick
                    label="Category type"
                    value={catalog.kind}
                    onChange={(v) =>
                      setCatalog({ ...catalog, kind: v, project_id: "" })
                    }
                    options={[
                      { value: "client", label: "Client" },
                      { value: "project", label: "Project" },
                      { value: "campaign", label: "Campaign / Ad Name" },
                    ]}
                  />
                </label>
                {catalog.kind !== "client" && (
                  <label>
                    Client
                    <Pick
                      label="Parent client"
                      value={catalog.client_id || "choose"}
                      onChange={(v) =>
                        setCatalog({
                          ...catalog,
                          client_id: v === "choose" ? "" : v,
                          project_id: "",
                        })
                      }
                      options={[
                        { value: "choose", label: "Choose a client" },
                        ...clients.map((x: any) => ({
                          value: x.id,
                          label: x.name,
                        })),
                      ]}
                    />
                  </label>
                )}
                {catalog.kind === "campaign" && (
                  <label>
                    Project (optional)
                    <Pick
                      label="Campaign project"
                      value={catalog.project_id || "none"}
                      onChange={(v) =>
                        setCatalog({
                          ...catalog,
                          project_id: v === "none" ? "" : v,
                        })
                      }
                      options={[
                        { value: "none", label: "Client-wide campaign" },
                        ...projects
                          .filter((p: any) => p.client_id === catalog.client_id)
                          .map((p: any) => ({ value: p.id, label: p.name })),
                      ]}
                    />
                  </label>
                )}
                <label>
                  Name
                  <input
                    required
                    maxLength={120}
                    value={catalog.name}
                    onChange={(e) =>
                      setCatalog({ ...catalog, name: e.target.value })
                    }
                  />
                </label>
                <button
                  className="primary"
                  disabled={
                    busy || (catalog.kind !== "client" && !catalog.client_id)
                  }
                >
                  Add{" "}
                  {catalog.kind === "campaign" ? "campaign / ad" : catalog.kind}
                </button>
              </form>
              <div className="field-list">
                {clients.map((cl: any) => (
                  <div key={cl.id}>
                    <strong>{cl.name}</strong>
                    <small>
                      Projects:{" "}
                      {projects
                        .filter((p: any) => p.client_id === cl.id)
                        .map((p: any) => p.name)
                        .join(", ") || "None"}
                    </small>
                    <small>
                      Campaigns / ads:{" "}
                      {campaigns
                        .filter((p: any) => p.client_id === cl.id)
                        .map((p: any) => p.name)
                        .join(", ") || "None"}
                    </small>
                  </div>
                ))}
              </div>
            </>
          )}
          {modal === "columns" && (
            <div className="checks">
              {fields.length ? (
                fields.map((f) => (
                  <label className="check-row" key={f.id}>
                    <Checkbox
                      checked={columns.includes(f.id)}
                      onCheckedChange={(v) => {
                        const next = v
                          ? [...columns, f.id]
                          : columns.filter((x) => x !== f.id);
                        setColumns(next);
                        localStorage.setItem(
                          "kefi-columns",
                          JSON.stringify(next),
                        );
                      }}
                    />
                    {f.name}
                  </label>
                ))
              ) : (
                <p>
                  Create custom fields in Add Leads to display them as columns.
                </p>
              )}
            </div>
          )}
          {modal === "followups" && (
            <div>
              {leads
                .filter((l) => l.followup)
                .sort((a, b) => a.followup.localeCompare(b.followup))
                .map((l) => (
                  <div className="focus-row" key={l.id}>
                    <button
                      onClick={() => {
                        setModal("");
                        setSelected(l);
                      }}
                    >
                      <strong>{l.name}</strong>
                      <small
                        className={
                          new Date(l.followup) < new Date() ? "overdue" : ""
                        }
                      >
                        {fmt(l.followup)}
                      </small>
                    </button>
                    <button className="secondary" onClick={() => openUpdate(l)}>
                      Update
                    </button>
                    <button className="call-button" onClick={() => call(l)}>
                      <Phone size={16} />
                    </button>
                  </div>
                ))}
              {!leads.some((l) => l.followup) && (
                <p>No follow-ups scheduled yet.</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
