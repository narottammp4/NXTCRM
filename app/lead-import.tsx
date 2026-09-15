"use client";
import { useEffect, useState } from "react";
import ImportSelect from "./import-select";
import {
  parseLeadText,
  decodeLeadFile,
  suggest,
  prepare,
  standard,
  type Field,
} from "@/lib/import-leads";
type Props = {
  client: any;
  clients: any[];
  onSelectClient: (id: string) => void;
  campaigns: any[];
  projects: any[];
  fields: Field[];
  existing: any[];
  isAdmin: boolean;
  onCreate: (body: any) => Promise<any>;
  onImport: (rows: any[]) => Promise<void>;
};
export default function LeadImport({
  client,
  clients,
  onSelectClient,
  campaigns,
  projects,
  fields,
  existing,
  isAdmin,
  onCreate,
  onImport,
}: Props) {
  const [separatorLabel, setSeparatorLabel] = useState("");
  const [pendingMove, setPendingMove] = useState<{
    index: number;
    oldIndex: number;
    target: string;
  } | null>(null);
  const [headers, setHeaders] = useState<string[]>([]),
    [rows, setRows] = useState<string[][]>([]),
    [mapping, setMapping] = useState<string[]>([]),
    [fileName, setFileName] = useState("");
  const [campaignId, setCampaignId] = useState(""),
    [projectId, setProjectId] = useState(""),
    [review, setReview] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [createCampaign, setCreateCampaign] = useState(false),
    [campaignName, setCampaignName] = useState(""),
    [campaignProject, setCampaignProject] = useState("");
  const [fieldColumn, setFieldColumn] = useState<number | null>(null),
    [fieldName, setFieldName] = useState(""),
    [fieldType, setFieldType] = useState("text"),
    [options, setOptions] = useState("");
  useEffect(() => {
    setPendingMove(null);
    setCampaignId("");
    setProjectId("");
    setReview(false);
    setCreateCampaign(false);
    setCampaignName("");
    setCampaignProject("");
  }, [client?.id]);
  useEffect(() => {
    setReview(false);
  }, [fields, rows, mapping]);
  const available = campaigns.filter((c) => c.client_id === client?.id),
    projectOptions = projects.filter((p) => p.client_id === client?.id);
  const campaign = available.find((c) => c.id === campaignId);
  const validCampaign = campaignId === "manual" || Boolean(campaign);
  const actualProject = campaign?.project_id || projectId;
  const result = prepare(headers, rows, mapping, fields, existing);
  const label = (target: string) =>
    target.startsWith("std:")
      ? (standard.find(([k]) => "std:" + k === target)?.[1] || target) +
        " — standard"
      : (fields.find((f) => "custom:" + f.id === target)?.name || target) +
        " — custom";
  async function createField() {
    setBusy(true);
    setError("");
    try {
      const response = await onCreate({
        action: "field",
        name: fieldName,
        type: fieldType,
        options: options
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        required: false,
        position: fields.length,
      });
      const f = response.fields.find((f: Field) => f.name === fieldName.trim());
      if (!f) throw Error("Field saved. Choose it from the mapping dropdown.");
      setMapping((m) =>
        m.map((v, i) => (i === fieldColumn ? "custom:" + f.id : v)),
      );
      setFieldColumn(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function addCampaign() {
    setBusy(true);
    setError("");
    try {
      const r = await onCreate({
        action: "catalog",
        kind: "campaign",
        name: campaignName,
        client_id: client.id,
        project_id: campaignProject,
      });
      setCampaignId(r.id);
      setProjectId(campaignProject);
      setCreateCampaign(false);
      setCampaignName("");
      setReview(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="lead-import">
      <div className="import-scope">
        <strong>
          Client: {client?.name || "Choose a client at the top left"}
        </strong>
        <p>The selected client receives every lead in this import.</p>
        {!client && (
          <div className="choose-import-client">
            <label>
              Choose a client to enable campaigns
              <ImportSelect
                aria-label="Choose client for import"
                value=""
                disabled={busy}
                onChange={(e) => {
                  if (e.target.value) onSelectClient(e.target.value);
                }}
              >
                <option value="">Select a client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </ImportSelect>
            </label>
            <small>
              This also updates the top-left client selector. Your uploaded CSV
              stays here.
            </small>
          </div>
        )}
      </div>
      <fieldset disabled={busy || !client} className="import-controls">
        <label>
          Campaign / Ad Name *
          <ImportSelect
            disabled={busy || !client}
            aria-label="Campaign / Ad Name"
            value={campaignId}
            onChange={(e) => {
              setCampaignId(e.target.value);
              setProjectId(
                available.find((c) => c.id === e.target.value)?.project_id ||
                  "",
              );
              setReview(false);
            }}
          >
            <option value="">Choose a campaign</option>
            <option value="manual">No campaign / Manual leads</option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </ImportSelect>
        </label>
        {isAdmin && (
          <button
            className="secondary"
            type="button"
            onClick={() => setCreateCampaign(!createCampaign)}
          >
            + Create campaign
          </button>
        )}
        {campaign?.project_id ? (
          <p>
            Project:{" "}
            <strong>
              {projects.find((p) => p.id === campaign.project_id)?.name}
            </strong>{" "}
            · From campaign
          </p>
        ) : (
          <label>
            Project (optional)
            <ImportSelect
              disabled={busy || !client}
              aria-label="Project"
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                setReview(false);
              }}
            >
              <option value="">No project</option>
              {projectOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </ImportSelect>
          </label>
        )}
        {createCampaign && (
          <div className="inline-create">
            <h3>Create campaign for {client?.name}</h3>
            <label>
              Campaign / Ad Name
              <input
                maxLength={120}
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
              />
            </label>
            <label>
              Project (optional)
              <ImportSelect
                disabled={busy || !client}
                aria-label="New campaign project"
                value={campaignProject}
                onChange={(e) => setCampaignProject(e.target.value)}
              >
                <option value="">Client-wide campaign</option>
                {projectOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </ImportSelect>
            </label>
            <button
              className="primary"
              disabled={!campaignName.trim()}
              onClick={addCampaign}
            >
              Create & select
            </button>
          </div>
        )}
      </fieldset>
      <div className="import-area">
        <h2>Bring your leads with you</h2>
        <p>
          Upload CSV or tab-separated text, choose what to keep, then review.
          Commas, tabs, semicolons and pipes are detected automatically. Up to 500 leads / 2 MB.
        </p>
        <input
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
          disabled={busy}
          aria-label="Upload leads CSV"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setError("");
            setReview(false);
            setPendingMove(null);
            setFieldColumn(null);
            try {
              if (file.size > 2000000)
                throw Error("Choose a file smaller than 2 MB.");
              const parsed = parseLeadText(decodeLeadFile(await file.arrayBuffer()));
              const csv = parsed.rows;
              if (csv.length < 2 || csv.length > 501)
                throw Error("CSV needs a header and 1–500 data rows.");
              setHeaders(csv[0]);
              setRows(csv.slice(1));
              setMapping(suggest(csv[0], fields));
              setFileName(file.name);
              setSeparatorLabel(({ ",": "Comma", "\t": "Tab", ";": "Semicolon", "|": "Pipe" } as Record<string, string>)[parsed.separator]);
            } catch (e) {
              setHeaders([]);
              setRows([]);
              setMapping([]);
              setFileName("");
              setError((e as Error).message);
            }
          }}
        />
      </div>
      {headers.length > 0 && (
        <>
          <p className="import-count">
            {fileName} · {separatorLabel}-separated · {headers.length} columns detected · {rows.length} leads ·{" "}
            {mapping.filter((m) => m !== "skip").length} columns kept
          </p>
          <p className="category-help">
            Each row below is one CSV column. Fields marked “Used by” can be
            moved after confirmation. Ambiguous names are left for you to
            choose. Skipping never changes your original CSV.
          </p>
          <fieldset disabled={busy}>
            <div className="mapping-grid">
              {headers.map((h, i) => (
                <div className="mapping-row" key={i}>
                  <div>
                    <strong>{h || "Unnamed column " + (i + 1)}</strong>
                    <small>
                      Sample: {rows.find((r) => r[i]?.trim())?.[i] || "Empty"}
                    </small>
                  </div>
                  <label>
                    Import as
                    <ImportSelect
                      disabled={busy}
                      aria-label={"Map CSV column " + (i + 1) + " " + h}
                      value={mapping[i] || "skip"}
                      onChange={(e) => {
                        setPendingMove(null);
                        if (e.target.value === "create") {
                          setFieldColumn(i);
                          setFieldName(h.slice(0, 80));
                          setFieldType("text");
                          setOptions("");
                          return;
                        }
                        const oldIndex = mapping.findIndex(
                          (v, j) =>
                            j !== i && v === e.target.value && v !== "skip",
                        );
                        if (oldIndex >= 0) {
                          setPendingMove({
                            index: i,
                            oldIndex,
                            target: e.target.value,
                          });
                          setReview(false);
                          return;
                        }
                        setMapping((m) =>
                          m.map((v, j) => (j === i ? e.target.value : v)),
                        );
                        setReview(false);
                      }}
                    >
                      <option value="skip">Skip this column</option>
                      <optgroup label="Standard fields">
                        {standard.map(([key, name]) => (
                          <option
                            disabled={key === "project" && !!actualProject}
                            key={key}
                            value={"std:" + key}
                          >
                            {name} — standard
                            {mapping.some(
                              (v, j) => j !== i && v === "std:" + key,
                            )
                              ? " · Used by " +
                                headers[
                                  mapping.findIndex(
                                    (v, j) => j !== i && v === "std:" + key,
                                  )
                                ]
                              : ""}
                            {key === "project" && actualProject
                              ? " (set by campaign/project)"
                              : ""}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Custom fields">
                        {fields.map((f) => (
                          <option key={f.id} value={"custom:" + f.id}>
                            {f.name} — custom ({f.type})
                            {mapping.some(
                              (v, j) => j !== i && v === "custom:" + f.id,
                            )
                              ? " · Used by " +
                                headers[
                                  mapping.findIndex(
                                    (v, j) => j !== i && v === "custom:" + f.id,
                                  )
                                ]
                              : ""}
                          </option>
                        ))}
                      </optgroup>
                      {isAdmin && (
                        <option value="create">+ Create custom field</option>
                      )}
                    </ImportSelect>
                    {pendingMove?.index === i && (
                      <div
                        className="mapping-move"
                        role="group"
                        aria-label="Confirm field mapping change"
                      >
                        <p>
                          <strong>{label(pendingMove.target)}</strong> is
                          currently mapped from{" "}
                          <strong>{headers[pendingMove.oldIndex]}</strong>. Move
                          it to <strong>{h}</strong>? The previous column will
                          be skipped.
                        </p>
                        <button
                          type="button"
                          className="primary"
                          onClick={() => {
                            setMapping((m) =>
                              m.map((v, j) =>
                                j === pendingMove.index
                                  ? pendingMove.target
                                  : j === pendingMove.oldIndex
                                    ? "skip"
                                    : v,
                              ),
                            );
                            setPendingMove(null);
                            setReview(false);
                          }}
                        >
                          Move mapping
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => setPendingMove(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </label>
                </div>
              ))}
            </div>
          </fieldset>
          {fieldColumn !== null && isAdmin && (
            <fieldset disabled={busy} className="inline-create">
              <h3>Create custom field for “{headers[fieldColumn]}”</h3>
              <label>
                Name
                <input
                  value={fieldName}
                  maxLength={80}
                  onChange={(e) => setFieldName(e.target.value)}
                />
              </label>
              <label>
                Type
                <ImportSelect
                  disabled={busy}
                  aria-label="Custom field type"
                  value={fieldType}
                  onChange={(e) => setFieldType(e.target.value)}
                >
                  {[
                    "text",
                    "number",
                    "date",
                    "dropdown",
                    "multi-select",
                    "checkbox",
                  ].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </ImportSelect>
              </label>
              {["dropdown", "multi-select"].includes(fieldType) && (
                <label>
                  Options (comma-separated)
                  <input
                    value={options}
                    onChange={(e) => setOptions(e.target.value)}
                  />
                </label>
              )}
              <p className="category-help">
                Dates: YYYY-MM-DD. Multi-select: semicolons between values.
                Numbers: no currency text. Field is optional for other leads.
              </p>
              <button
                className="primary"
                disabled={
                  !fieldName.trim() ||
                  (["dropdown", "multi-select"].includes(fieldType) &&
                    !options.trim())
                }
                onClick={createField}
              >
                Create & map
              </button>
              <button
                className="secondary"
                onClick={() => setFieldColumn(null)}
              >
                Cancel
              </button>
            </fieldset>
          )}
          {actualProject && mapping.includes("std:project") && (
            <p role="alert">
              Project is set by your campaign/project selection. Skip the CSV
              Project column, or clear the selected project before mapping it.
            </p>
          )}
          <button
            className="primary"
            disabled={
              busy ||
              !client ||
              !validCampaign ||
              fieldColumn !== null ||
              pendingMove !== null ||
              (!!actualProject && mapping.includes("std:project"))
            }
            onClick={() => {
              setReview(true);
              setError("");
            }}
          >
            Review import
          </button>
          {review && (
            <div className="import-review">
              <h3>Confirm import</h3>
              <p>
                <strong>{client?.name}</strong> ·{" "}
                {projects.find((p) => p.id === actualProject)?.name ||
                  "No project"}{" "}
                · {campaign?.name || "Manual leads"} · {rows.length} leads
              </p>
              <p>
                Kept:{" "}
                {headers.filter((_, i) => mapping[i] !== "skip").join(", ") ||
                  "None"}
              </p>
              <p>
                Skipped:{" "}
                {headers.filter((_, i) => mapping[i] === "skip").join(", ") ||
                  "None"}
              </p>
              {result.errors.length > 0 ? (
                <div role="alert">
                  <strong>
                    {result.errors.length} issues — nothing will be imported
                    until corrected.
                  </strong>
                  <ul>
                    {result.errors.slice(0, 30).map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                  {result.errors.length > 30 && (
                    <p>
                      Showing the first 30 issues. Correct the CSV and upload it
                      again.
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <p>Preview of the first {Math.min(5, rows.length)} leads:</p>
                  <div className="preview-scroll">
                    <table>
                      <thead>
                        <tr>
                          {headers.map(
                            (h, i) =>
                              mapping[i] !== "skip" && (
                                <th key={i}>{label(mapping[i])}</th>
                              ),
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.slice(0, 5).map((r, i) => (
                          <tr key={i}>
                            {headers.map(
                              (_, j) =>
                                mapping[j] !== "skip" && (
                                  <td key={j}>{r[j]}</td>
                                ),
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="category-help">
                    The server also checks permissions and duplicates. A failed
                    import saves no leads.
                  </p>
                  <button
                    className="primary"
                    disabled={busy || !client || !validCampaign}
                    onClick={async () => {
                      setBusy(true);
                      setError("");
                      try {
                        await onImport(
                          result.leads.map((l) => ({
                            ...l,
                            client_id: client.id,
                            project_id: actualProject,
                            campaign_id:
                              campaignId === "manual" ? "" : campaignId,
                          })),
                        );
                        setHeaders([]);
                        setRows([]);
                        setMapping([]);
                        setReview(false);
                        setFileName("");
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {busy
                      ? "Importing…"
                      : "Confirm & import " + rows.length + " leads"}
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}
      {error && (
        <p className="import-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
