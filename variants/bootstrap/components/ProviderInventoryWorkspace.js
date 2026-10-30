"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@medreach/core";
import { productApi } from "../lib/productApi";
import DiagnosticCapacityManager from "./DiagnosticCapacityManager";

const countFields = ["capacity", "occupied", "blocked", "held"];
const emptyForm = { capacity: "", occupied: "", blocked: "", held: "", observedAt: "" };
const label = (key) => key.replaceAll("_", " ");
const displayed = (value) => value === null || value === undefined ? "Unknown" : value;
const localTime = (value) => { if (!value) return ""; const date = new Date(value); return new Date(date - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19); };
export default function ProviderInventoryWorkspace() {
  const { user, ready } = useAuth();
  const [nextOrganizationPage, setNextOrganizationPage] = useState(null);
  const [organizations, setOrganizations] = useState([]), [catalogue, setCatalogue] = useState({}), [organizationId, setOrganizationId] = useState("");
  const [rows, setRows] = useState([]), [resourceKey, setResourceKey] = useState(""), [history, setHistory] = useState([]), [version, setVersion] = useState(null);
  const [form, setForm] = useState(emptyForm), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [csv, setCsv] = useState(""), [stage, setStage] = useState(null), [attested, setAttested] = useState(false), [confirmed, setConfirmed] = useState(false);
  const generation = useRef(0), active = useRef(true);
  const current = organizations.find((row) => row._id === organizationId);
  const resources = catalogue[current?.kind] || [];
  const selected = rows.find((row) => row.resourceKey === resourceKey);
  const path = current ? `/api/inventory/${current.kind}/${current._id}` : "";
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    if (!ready) return;
    if (user?.role !== "provider_admin") { setLoading(false); return; }
    let cancelled = false;
    Promise.all([productApi("/api/providers/mine"), productApi("/api/provider-imports/catalogue")]).then(([mine, definitions]) => {
      if (cancelled) return;
      const items = mine.data || mine.organizations || [];
      setOrganizations(items); setNextOrganizationPage(mine.nextPage || null); setCatalogue(definitions.data || {}); setOrganizationId(items[0]?._id || "");
    }).catch((error) => { if (!cancelled) setNotice(error.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ready, user?.role]);
  useEffect(() => {
    generation.current++;
    setRows([]); setHistory([]); setVersion(null); setForm(emptyForm); setStage(null); setAttested(false); setConfirmed(false); setCsv("");
    setResourceKey((catalogue[current?.kind] || [])[0]?.key || "");
  }, [organizationId, catalogue, current?.kind]);
  const load = useCallback(async () => {
    if (!path || !resourceKey) return;
    const token = ++generation.current;
    setBusy(true); setVersion(null);
    try {
      const [inventory, observations] = await Promise.all([productApi(path), productApi(`${path}/${resourceKey}/history?limit=5`)]);
      if (!active.current || token !== generation.current) return;
      const nextRows = inventory.data || [], item = nextRows.find((row) => row.resourceKey === resourceKey);
      const latest = observations.data?.[0];
      setRows(nextRows); setHistory(observations.data || []); setVersion(item?.version ?? 0);
      const snapshot = latest?.version === item?.version ? latest.snapshot : null;
      setForm(Object.fromEntries([...countFields.map((key) => [key, snapshot?.[key] ?? ""]), ["observedAt", localTime(snapshot?.observedAt)]]));
    } catch (error) { if (active.current && token === generation.current) setNotice(error.message); }
    finally { if (active.current && token === generation.current) setBusy(false); }
  }, [path, resourceKey]);
  useEffect(() => { load(); }, [load]);
  const save = async (event) => {
    event.preventDefault(); if (busy || version === null) return;
    const input = { expectedVersion: version, reportingMethod: "provider_report", unit: resources.find((row) => row.key === resourceKey)?.unit };
    for (const key of countFields) { const value = form[key]; if (value !== "" && (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)))) { setNotice("Use non-negative whole numbers. Leave an unknown count blank."); return; } input[key] = value === "" ? null : Number(value); }
    const observedAt = new Date(form.observedAt);
    if (!Number.isFinite(observedAt.getTime()) || observedAt > new Date() || Date.now() - observedAt > 30 * 60000) { setNotice("Enter the actual observation time within the last 30 minutes, without a future date."); return; }
    input.observedAt = observedAt.toISOString();
    setBusy(true); setNotice("");
    try {
      const result = await productApi(`${path}/${resourceKey}`, { method: "PUT", body: input });
      setNotice(result.historyPending ? "Inventory saved. Observation history is pending recovery." : "Inventory observation saved.");
      await load();
    } catch (error) { if (error.status === 409) { setVersion(null); setNotice("The inventory changed or a newer observation exists. Your entries are preserved. Copy anything you need, then reload the latest record before editing again."); } else setNotice(error.message); }
    finally { if (active.current) setBusy(false); }
  };
  const moreOrganizations = async () => {
    if (busy || !nextOrganizationPage) return;
    setBusy(true);
    try {
      const next = await productApi(`/api/providers/mine?page=${nextOrganizationPage}&limit=100`);
      setOrganizations((items) => [...new Map([...items, ...(next.data || [])].map((row) => [row._id, row])).values()]);
      setNextOrganizationPage(next.nextPage || null);
    } catch (error) { setNotice(error.message); }
    finally { if (active.current) setBusy(false); }
  };
  const importAction = async (operation) => {
    if (busy) return; setBusy(true); setNotice("");
    try {
      const result = operation === "preview" ? await productApi(`/api/provider-imports/${current.kind}/${current._id}/preview`, { method: "POST", body: { csv } }) : operation === "refresh" ? await productApi(`/api/provider-imports/${stage.id}`) : await productApi(`/api/provider-imports/${stage.id}/confirm`, { method: "POST", body: { digest: stage.digest, attestProviderObserved: attested } });
      setStage(result); setConfirmed(false); setAttested(false);
      setNotice(operation === "preview" ? "Preview created. Review every row before confirming." : `Import status: ${result.status}. Review each row below.`);
      if (operation !== "preview") await load();
    } catch (error) { setNotice(`${error.message}${operation === "confirm" ? " Refresh import status before trying again; some rows may already have applied." : ""}`); }
    finally { if (active.current) setBusy(false); }
  };
  if (!ready || loading) return <p role="status">Loading inventory workspace…</p>;
  if (user?.role !== "provider_admin") return <div className="surface"><h1>Provider inventory</h1><p>An active, assigned Provider Admin account is required to report inventory.</p><Link href="/provider">Return to provider workspace</Link></div>;
  return <div className="vstack gap-3"><header><h1>Provider inventory</h1><p>Report observed resource counts for your assigned organisation. Ordinary bed requests can hold verified inventory after you explicitly enable reservations. Emergency requests remain coordination requests.</p><Link href="/provider">Back to provider workspace</Link></header>
    {notice && <div className="alert alert-info text-break" role="status">{notice} <Link href="/profile#multi-factor-authentication">Account security</Link></div>}
    <section className="surface"><h2 className="h4">Organisation and resource</h2>{!organizations.length ? <p>No organisation is assigned. Contact your System Admin.</p> : <div className="row g-3"><div className="col-md-6"><label htmlFor="inventory-organization" className="form-label">Assigned organisation</label><select id="inventory-organization" className="form-select" disabled={busy} value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>{organizations.map((row) => <option key={row._id} value={row._id}>{row.name} · {label(row.kind)}</option>)}</select>{nextOrganizationPage && <button type="button" className="btn btn-link px-0" disabled={busy} onClick={moreOrganizations}>Load more assigned organisations</button>}</div><div className="col-md-6"><label htmlFor="inventory-resource" className="form-label">Resource</label><select id="inventory-resource" className="form-select" disabled={busy} value={resourceKey} onChange={(event) => { setForm(emptyForm); setHistory([]); setResourceKey(event.target.value); }}>{resources.map((row) => <option key={row.key} value={row.key}>{label(row.key)} · {row.unit}</option>)}</select></div></div>}</section>
    {current?.kind === "diagnostic" && <DiagnosticCapacityManager key={current._id} organizationId={current._id} />}
    {current?.kind === "hospital" && selected && <section className="surface"><h2 className="h4">Ordinary bed reservations</h2><p>Reservations: {selected.reservationsEnabled ? "enabled" : "disabled"}. Fresh, provider-confirmed counts are required. Existing active allocations must be resolved before changing this setting.</p><button type="button" className="btn btn-outline-primary" disabled={busy || version === null} onClick={async () => {
      setBusy(true); setNotice("");
      try { await productApi(`/api/capacity/hospital/${current._id}/configure`, { method: "POST", body: { resourceKey, enabled: !selected.reservationsEnabled, expectedVersion: version } }); await load(); }
      catch (error) { setNotice(error.message); }
      finally { setBusy(false); }
    }}>{selected.reservationsEnabled ? "Disable reservations" : "Enable reservations for this resource"}</button></section>}
    {current && resourceKey && <><section className="surface"><h2 className="h4">Current observation</h2><p>Published availability: <strong>{displayed(selected?.available)}</strong> · {selected?.freshness || "unknown"} · Classification: {label(selected?.classification || "unknown")}</p><p>Version: {selected?.version ?? 0} · Observed: {selected?.observedAt ? new Date(selected.observedAt).toLocaleString() : "Unknown"}</p><p>Blank counts mean unknown. Zero means a confirmed zero. Demo records remain demo even after updates. Numerical availability expires after 30 minutes.</p>
      <form onSubmit={save} aria-busy={busy}><div className="row g-3">{countFields.map((key) => <div className="col-6 col-md-3" key={key}><label htmlFor={`inventory-${key}`} className="form-label">{key === "capacity" ? "Operational capacity" : label(key)}</label><input id={`inventory-${key}`} className="form-control" type="number" min="0" max={key === "held" && !selected?.reservationsEnabled ? 0 : undefined} readOnly={key === "held" && selected?.reservationsEnabled} step="1" placeholder="Unknown" value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></div>)}<div className="col-md-6"><label htmlFor="inventory-observed" className="form-label">Actual observation time (your local time)</label><input id="inventory-observed" className="form-control" type="datetime-local" step="1" required value={form.observedAt} onChange={(event) => setForm({ ...form, observedAt: event.target.value })} /></div></div><p className="mt-3">{selected?.reservationsEnabled ? "Held is managed by active requests and cannot be edited manually." : "Held must be blank or zero while reservations are disabled."} Available = capacity − occupied − blocked − held when all counts are known.</p><div className="d-flex flex-wrap gap-2"><button className="btn btn-primary" disabled={busy || version === null}>Save observed counts</button><button className="btn btn-outline-secondary" type="button" disabled={busy} onClick={load}>Reload latest record (replace entries)</button></div></form>
      <h3 className="h5 mt-4">Recent observation history</h3>{history.length ? <div className="table-responsive"><table className="table"><thead><tr><th>Version</th><th>Observed</th><th>Classification</th><th>Available</th></tr></thead><tbody>{history.map((row) => <tr key={row._id || row.version}><td>{row.version}</td><td>{row.observedAt ? new Date(row.observedAt).toLocaleString() : "Unknown"}</td><td>{label(row.classification || "unknown")}</td><td>{displayed(row.snapshot?.available)}</td></tr>)}</tbody></table></div> : <p>No observations recorded.</p>}</section>
      <section className="surface"><h2 className="h4">Import observed inventory</h2><p>Paste a CSV with 1–25 rows, up to 64 KiB. Leave unknown counts blank; supply each resource’s current version. Previews expire after 15 minutes. Imports may partially apply, so review row results.</p><label htmlFor="inventory-csv" className="form-label">Inventory CSV</label><textarea id="inventory-csv" className="form-control font-monospace" rows={7} value={csv} onChange={(event) => { setCsv(event.target.value); setStage(null); setAttested(false); setConfirmed(false); }} placeholder="resourceKey,unit,capacity,occupied,blocked,held,observedAt,expectedVersion" /><button className="btn btn-outline-primary my-3" disabled={busy || !csv.trim()} type="button" onClick={() => importAction("preview")}>Validate and preview CSV</button>
      {stage && <div><h3 className="h5">Import preview · {stage.status}</h3><p className="text-break">Digest: <code>{stage.digest}</code></p><p>Expires: {new Date(stage.expiresAt).toLocaleString()} · Attempts: {stage.attempts || 0}{stage.terminalReason ? ` · ${stage.terminalReason}` : ""}</p><div className="table-responsive"><table className="table"><thead><tr><th>Resource</th><th>Capacity</th><th>Occupied</th><th>Blocked</th><th>Held</th><th>Version</th><th>Observed</th><th>Result</th></tr></thead><tbody>{stage.rows.map((row) => <tr key={row.resourceKey}><td>{label(row.resourceKey)}</td>{countFields.map((key) => <td key={key}>{displayed(row.input[key])}</td>)}<td>{row.input.expectedVersion}</td><td>{row.input.observedAt ? new Date(row.input.observedAt).toLocaleString() : "Unknown"}</td><td>{row.state || "pending"}{row.errorCode ? ` · ${row.errorCode}` : ""}</td></tr>)}</tbody></table></div>
      {["preview", "partial"].includes(stage.status) && <><div className="form-check"><input id="inventory-attested" type="checkbox" className="form-check-input" checked={attested} onChange={(event) => setAttested(event.target.checked)} /><label htmlFor="inventory-attested" className="form-check-label">These are actual provider-observed values, not invented or demo capacities.</label></div><div className="form-check mb-3"><input id="inventory-confirmed" type="checkbox" className="form-check-input" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><label htmlFor="inventory-confirmed" className="form-check-label">I reviewed this exact preview and its digest for {current.name}.</label></div><button className="btn btn-primary me-2" disabled={busy || !attested || !confirmed} type="button" onClick={() => importAction("confirm")}>Confirm reviewed import</button></>}<button className="btn btn-outline-secondary" disabled={busy} type="button" onClick={() => importAction("refresh")}>Refresh import status</button></div>}
      </section></>}
  </div>;
}
