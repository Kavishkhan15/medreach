import { organizationIsAvailable } from "./providerLifecycle.js";
import { refreshAmbulanceDeliveryState } from "./ambulanceDeliveryState.js";
import { User } from "../models/User.js";
import { Hospital } from "../models/Hospital.js";
import { ResourceProvider } from "../models/ResourceProvider.js";
import { ProviderMembership } from "../models/ProviderMembership.js";
import { RequestNotification } from "../models/RequestNotification.js";
import { runEmailBatch } from "./emailBatch.js";
import { sendEmailEvent } from "./emailService.js";
import { EmailDelivery } from "../models/EmailDelivery.js";
const eligible = { accountStatus: "active", notificationsEnabled: true, notificationEmailVerifiedAt: { $type: "date" } };
export async function assignedProviderUsers(kind, organizationId) {
  if (!organizationId || !await organizationIsAvailable(kind, organizationId)) return [];
  const rows = organizationId ? await ProviderMembership.find({ kind, organization: organizationId, active: true, $or: [{ accessLevel: "admin" }, { accessLevel: { $exists: false } }] }).lean() : [];
  const ids = rows.map((r) => r.user);
  const provider = await User.find({ _id: { $in: ids }, accountStatus: "active", role: "provider_admin" }).lean();
  if (kind === "hospital" && organizationId) {
    const hospital = await Hospital.findById(organizationId).select("admins").lean();
    provider.push(...await User.find({ _id: { $in: hospital?.admins || [] }, accountStatus: "active", role: "hospital_admin" }).lean());
  }
  return provider;
}
export async function notificationRecipients(kind, organizationId, isEmergency) {
  const provider = (await assignedProviderUsers(kind, organizationId)).filter((u) => u.notificationsEnabled && u.notificationEmailVerifiedAt && u.notificationEmail);
  const system = isEmergency ? await User.find({ ...eligible, role: "system_admin" }).select("notificationEmail role").lean() : [];
  const seen = new Set();
  return [...system.map((user) => ({ user, channel: "system" })), ...provider.map((user) => ({ user, channel: "provider" }))]
    .filter(({ user }) => { if (!user.notificationEmail || seen.has(user.notificationEmail)) return false; seen.add(user.notificationEmail); return true; });
}
export function requestRouting(record, type) {
  if (type === "DiagnosticRequest") return { kind: "diagnostic", organizationId: record.provider, reference: record.reference, isEmergency: false };
  if (type === "EmergencyRequest") return { kind: "hospital", organizationId: record.hospital, reference: record.requestId, isEmergency: record.isEmergency === true };
  if (type === "BloodRequest") return { kind: "blood_bank", organizationId: record.provider, reference: record.reference, isEmergency: record.type === "REQUEST" && record.isUrgent === true };
  return { kind: "ambulance", organizationId: record.provider, reference: record.reference, isEmergency: record.isEmergency === true };
}
export async function routeRequestNotifications(record, sourceType, extraTasks = [], progress = {}) {
  const routing = requestRouting(record, sourceType);
  const recipients = await notificationRecipients(routing.kind, routing.organizationId, routing.isEmergency);
  const org = routing.organizationId ? await (routing.kind === "hospital" ? Hospital : ResourceProvider).findById(routing.organizationId).select("name").lean() : null;
  progress.started = true;
  const results = await runEmailBatch([...extraTasks, ...recipients.map(({ user, channel }) => async () => {
    const eventKey = `request-routing:${sourceType}:${record._id}:${user._id}`;
    const intent = await RequestNotification.findOneAndUpdate({ eventKey }, { $setOnInsert: {
      sourceType, source: record._id, recipient: user._id, channel, email: user.notificationEmail,
    } }, { upsert: true, new: true });
    if (intent.email !== user.notificationEmail && intent.status === "pending") {
      intent.status = "cancelled"; await intent.save(); return;
    }
    // An earlier sender may already have completed the durable delivery.
    const previous = await EmailDelivery.findOne({ eventKey });
    if (previous && ["sent", "disabled", "uncertain"].includes(previous.status)) {
      intent.status = previous.status;
      await intent.save();
    } else if (intent.status === "pending") {
      const delivery = await sendEmailEvent({ eventKey, to: intent.email,
        recipientUser: user._id, recipientContactPolicy: "notification",
        template: channel === "system" ? "system_emergency" : "provider_request",
        data: { reference: routing.reference, organization: org?.name || "Unassigned organisation" },
        source: { model: "RequestNotification", id: intent._id, channel: channel === "system" ? "admin" : "provider" } });
      intent.status = ["pending", "sent", "disabled", "failed", "uncertain"].includes(delivery?.status) ? delivery.status : "failed";
      await intent.save();
    }
  })]);
  if (results.some((r) => r.status === "rejected")) throw new Error("Notification intent processing incomplete");
  if (sourceType === "AmbulanceBooking") await refreshAmbulanceDeliveryState(record);
  const pending = await RequestNotification.exists({ sourceType, source: record._id, status: "pending" });
  if (!pending) record.notificationRoutedAt = new Date();
  record.notificationRouting = recipients.length ? "recorded" : "no_eligible_recipients";
  await record.save();
  return { recipients: recipients.length, provider: recipients.filter((r) => r.channel === "provider").length, system: recipients.filter((r) => r.channel === "system").length };
}
export async function routeRequestSafely(record, sourceType, extraTasks = []) {
  const progress = {};
  try { return await routeRequestNotifications(record, sourceType, extraTasks, progress); }
  catch { if (!progress.started) await runEmailBatch(extraTasks); console.warn("[medreach] Request saved; notification routing will be retried."); return null; }
}

export async function providerEmailTasks(kind, organizationId, eventKey, template, data) {
  const recipients = await notificationRecipients(kind, organizationId, false);
  return recipients.map(({ user }) => () => sendEmailEvent({ eventKey: `${eventKey}:${user._id}`, to: user.notificationEmail,
    recipientUser: user._id, recipientContactPolicy: "notification", template, data }));
}
