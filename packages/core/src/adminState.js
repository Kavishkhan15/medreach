"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { listAdminHospitals } from "./api.js";

const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value) => typeof value === "string" && value.length > 0;
const optionalText = (r, fields) => fields.every((field) => r[field] == null || typeof r[field] === "string");
const reference = (r) => r == null || text(r) || (object(r) && optionalText(r, ["name", "role", "slug", "email", "emergencyContact"]));
const count = (value) => Number.isSafeInteger(value) && value >= 0;
export function invalidAdminResponse() {
  const error = new Error("The service returned an unexpected response. Please retry.");
  error.code = "INVALID_RESPONSE";
  return error;
}

// Validate the response before treating an absent list or count as an empty result.
const records = {
  organization: (r) => text(r.name) && ["hospital", "blood_bank", "diagnostic", "ambulance"].includes(r.kind),
  providerAccount: (r) => text(r.name) && text(r.email) && text(r.accountStatus) && text(r.credentialLabel) && Array.isArray(r.organizations) && r.organizations.every((o) => object(o) && text(o._id) && text(o.organizationId) && text(o.name) && text(o.kind) && typeof o.active === "boolean"),
  providerApplication: (r) => text(r.name) && text(r.kind) && text(r.status) && text(r.contactEmail) && text(r.address),
  bloodRequest: (r) => text(r.reference) && text(r.type) && text(r.status) && text(r.bloodGroup),
  booking: (r) => text(r.reference) && text(r.status) && object(r.requestSnapshot),
  hospital: (r) => text(r.name) && text(r.slug) && optionalText(r, ["hospitalType", "verificationStatus", "lastUpdated", "phone", "emergencyPhone", "website"]) && (r.facilities === undefined || (Array.isArray(r.facilities) && r.facilities.every((f) => object(f) && text(f.facility) && optionalText(f, ["status"])))),
  audit: (r) => text(r.action) && text(r.entityType) && text(r.createdAt) && optionalText(r, ["requestId"]) && reference(r.user),
  user: (r) => text(r.name) && text(r.email) && text(r.role) && text(r.accountStatus) && object(r.providers) && typeof r.providers.password === "boolean",
  ownership: (r) => text(r.status) && object(r.hospital) && text(r.hospital.name) && reference(r.requester) && optionalText(r, ["hospitalEmail", "officialDomain", "explanation"]),
  job: (r) => text(r.title) && text(r.status) && optionalText(r, ["description", "category", "employmentType"]) && reference(r.hospital) && reference(r.provider),
  request: (r) => text(r.requestId) && text(r.status) && reference(r.hospital),
  // Read-only summaries retain unavailable hospitals and unclassified closed legacy history.
  emergencyRequest: (r) => text(r.requestId) && text(r.status) && (typeof r.isEmergency === "boolean" || (r.isEmergency === undefined && ["EXPIRED", "CANCELLED", "COMPLETED", "REJECTED"].includes(r.status))) && (r.hospital === null || text(r.hospital) || (object(r.hospital) && text(r.hospital._id) && reference(r.hospital))) && optionalText(r, ["createdAt"]),
  staffRequest: (r) => text(r.requestId) && text(r.status) && (text(r.hospital) || (object(r.hospital) && text(r.hospital._id) && reference(r.hospital))) && optionalText(r, ["emergencyType", "requiredFacility", "contactPhone", "createdAt", "patientSummary", "hospitalResponse"]) && Array.isArray(r.timeline) && r.timeline.every((event) => object(event) && optionalText(event, ["actorRole", "note"])) && text(r.expiresAt),
  claim: (r) => text(r.facility) && text(r.capability) && text(r.verificationStatus) && optionalText(r, ["evidenceText", "sourcePageUrl", "observedAt", "confidence"]) && reference(r.source) && reference(r.hospital),
  candidate: (r) => text(r.facility) && text(r.status) && text(r.candidateCapability) && text(r.evidenceExcerpt) && optionalText(r, ["model", "sourcePageUrl"]) && reference(r.source) && reference(r.hospital),
  application: (r) => text(r.status) && optionalText(r, ["candidateName", "contactEmail", "candidatePhone", "phone", "qualifications", "qualification", "degree", "sop", "statement"]) && reference(r.applicant) && (r.resume == null || (object(r.resume) && optionalText(r.resume, ["fileUrl", "fileName"]))),
};
export function adminList(kind) {
  return (response) => {
    if (!object(response) || !Array.isArray(response.data) || response.data.some((row) => !object(row) || !text(row._id) || !(records[kind] || (() => true))(row))) {
      throw invalidAdminResponse();
    }
    return response.data;
  };
}
export function adminOverviewData(r) {
  if (!object(r) || ![r.hospitals, r.verified, r.verificationQueue].every(count)) throw invalidAdminResponse();
  return r;
}
export function adminAnalyticsData(r) {
  const groups = [r?.resources, r?.emergencyRequests, r?.jobs, r?.applications];
  if (!object(r?.hospitals) || ![r.hospitals.total, r.hospitals.verified, r?.conflicts?.facility, r?.conflicts?.field].every(count)
    || groups.some((rows) => !Array.isArray(rows) || rows.some((row) => !object(row) || !count(row.count) || (row._id !== null && typeof row._id !== "string")))) throw invalidAdminResponse();
  return r;
}
export function adminEmailData(r) {
  if (!object(r) || !text(r.mode) || typeof r.configured !== "boolean") throw invalidAdminResponse();
  return r;
}
export function adminAvailabilityData(r) {
  if (!object(r) || !count(r.observations) || !Array.isArray(r.latest) || r.latest.some((f) => !object(f) || !text(f.facility) || !text(f.status))) throw invalidAdminResponse();
  return r;
}
export function adminRefinementData(r) {
  if (!object(r) || typeof r.configured !== "boolean" || (r.configured && !text(r.model))) throw invalidAdminResponse();
  return r;
}
export function adminEntity(key) {
  return (r) => {
    const entity = r?.[key];
    const check = records[key] || ({
      data: (e) => text(e.name) && text(e.kind),
      claim: (e) => (text(e.status) && Boolean(e.hospital)) || records.claim(e),
      observation: (e) => text(e.facility) && text(e.status) && text(e.observedAt),
      alert: (e) => text(e.title) && text(e.body),
    })[key];
    // Ownership and facility mutations both use the "claim" envelope.
    const valid = key === "claim" ? ((text(entity?.status) && Boolean(entity?.hospital)) || (object(entity) && records.claim(entity))) : (object(entity) && check?.(entity));
    if (!object(r) || !object(entity) || !text(entity._id) || !valid) throw invalidAdminResponse();
    return r[key];
  };
}
export function adminAcknowledgement(r) {
  if (!object(r) || r.ok !== true) throw invalidAdminResponse();
  return r;
}
export function adminRefinementResult(r) {
  if (!object(r) || !Array.isArray(r.candidates) || r.candidates.some((c) => !object(c) || !text(c._id) || !records.candidate(c))) throw invalidAdminResponse();
  return r;
}

export function adminErrorMessage(error, mutation = false) {
  const status = error?.status;
  if (status === 401) return "Your session has expired. Sign in again, then retry.";
  if (status === 403) return "You do not have permission to perform this action.";
  if (status === 400 || status === 422) return "The submitted information was not accepted. Check the fields and try again.";
  if (status === 409) return "The record has changed or this action is no longer allowed. Refresh and check its current status.";
  if (status === 404 || status === 410) return "This record is no longer available. Refresh the list.";
  if (status === 429) return "Too many requests. Wait a moment, then retry.";
  if (mutation) return "The result could not be confirmed. The action may have completed. Refresh and verify the current status before submitting again.";
  if (error?.code === "INVALID_RESPONSE") return "The service returned an unexpected response. Please retry.";
  return "This information is temporarily unavailable. Please retry.";
}

// Every reload supersedes the previous read. Late responses and unmounted pages
// cannot publish results; cancellation also avoids unnecessary network work.
export function useAdminResource(load, validate, enabled = true) {
  const [state, setState] = useState({ status: "loading", data: null, error: "" });
  const generation = useRef(0);
  const controller = useRef(null);
  const reload = useCallback(async () => {
    if (!enabled) return false;
    const current = ++generation.current;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setState((previous) => ({ ...previous, status: "loading", error: "" }));
    let timeout;
    try {
      // Authentication refresh may be shared and cannot always be aborted by
      // this resource's signal. Bound the whole read, including that wait.
      const response = await Promise.race([load(request.signal), new Promise((_, reject) => {
        timeout = setTimeout(() => { request.abort(); reject(new Error("Read timed out")); }, 20000);
      })]);
      const data = validate(response);
      if (current !== generation.current) return false;
      setState({ status: "success", data, error: "", source: load });
      return true;
    } catch (error) {
      if (current !== generation.current) return false;
      setState((previous) => ({ ...previous, status: "error", error: adminErrorMessage(error), source: load }));
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }, [load, validate, enabled]);
  useEffect(() => {
    if (enabled) reload();
    return () => { generation.current += 1; controller.current?.abort(); };
  }, [reload, enabled]);
  return { ...state, ...(state.source !== load ? { status: "loading", data: null, error: "" } : {}), reload };
}

// Read the complete existing directory so admin counts and queues are not based
// on just the public endpoint's default first twelve records.
export async function loadAdminHospitals(signal) {
  const data = [];
  let page = 1;
  const parse = adminList("hospital");
  while (true) {
    const response = await listAdminHospitals({ page, limit: 50 }, { signal });
    const rows = parse(response);
    if (!count(response.total) || response.page !== page || !count(response.perPage) || !response.perPage || response.total > 100000 || data.length + rows.length > response.total || (response.total > data.length && !rows.length)) throw invalidAdminResponse();
    data.push(...rows);
    if (data.length >= response.total) break;
    page += 1;
  }
  return { data };
}

export function useAdminAction() {
  const locked = useRef(false);
  const mounted = useRef(true);
  const [state, setState] = useState({ busy: false, uncertain: false, message: "", kind: "" });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const run = useCallback(async (perform, { validate = adminAcknowledgement, success = "Action confirmed.", refresh, target = "" } = {}) => {
    if (locked.current) return false;
    locked.current = true;
    setState({ busy: true, uncertain: false, message: "Saving…", kind: "pending", target });
    let result;
    let timeout;
    try {
      const response = await Promise.race([perform(), new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Unconfirmed action")), 30000);
      })]);
      clearTimeout(timeout);
      result = validate(response);
    } catch (error) {
      clearTimeout(timeout);
      const uncertain = !error?.status || error.status >= 500 || error.status === 408;
      locked.current = uncertain;
      if (mounted.current) setState({ busy: false, uncertain, message: adminErrorMessage(error, true), kind: "error", target });
      return false;
    }
    if (mounted.current) setState({ busy: true, uncertain: false, message: success, kind: "success", target });
    // A failed follow-up read must never turn a confirmed write into a failure.
    if (refresh) {
      try {
        if (await refresh() === false && mounted.current) setState({ busy: true, uncertain: false, message: `${success} The updated view could not be loaded; retry the data panel.`, kind: "success", target });
      } catch {
        if (mounted.current) setState({ busy: true, uncertain: false, message: `${success} The updated view could not be loaded; retry the data panel.`, kind: "success", target });
      }
    }
    locked.current = false;
    if (mounted.current) setState((previous) => ({ ...previous, busy: false }));
    return result;
  }, []);
  const acknowledge = useCallback(() => {
    locked.current = false;
    setState({ busy: false, uncertain: false, message: "Current status checked. Submit again only if the action is still needed.", kind: "info" });
  }, []);
  return { ...state, disabled: state.busy || state.uncertain, run, acknowledge };
}

export function providerReportData(response) {
  const r = response?.data;
  if (!object(r) || !text(r.organizationId) || !text(r.kind) || !text(r.generatedAt) || !count(r.applications) || (r.observations !== null && !count(r.observations)) || !Array.isArray(r.requests) || r.requests.some((row) => !object(row) || !text(row._id) || !count(row.count))) throw invalidAdminResponse();
  return r;
}
