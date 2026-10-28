import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { createHmac } from "node:crypto";
import { env } from "../src/config/env.js";
import { EmailDelivery } from "../src/models/EmailDelivery.js";
import { EmailWebhookEvent } from "../src/models/EmailWebhookEvent.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { User } from "../src/models/User.js";
import { sendEmailEvent, retryEmailDelivery, resolveEmailDelivery, setEmailQueueEnabled,
  setResendFetchForTests, setEmailTransportFactoryForTests } from "../src/services/emailService.js";
import { reconcileEmailDeliveryLeases } from "../src/services/emailDeliveryWorker.js";
import { acceptResendWebhook, reconcileWebhookEvents } from "../src/services/resendWebhook.js";
const uri = process.env.MEDREACH_NOTIFICATION_LIFECYCLE_TEST_MONGO_URI;
const isolated = Boolean(uri && /^mongodb:\/\/(?:127\.0\.0\.1|localhost):\d+\/medreach_notification_lifecycle_test$/.test(uri));
const secret = `whsec_${Buffer.from("isolated-signing-key-not-a-real-secret").toString("base64")}`;
function webhook(id, messageId, type, occurredAt = new Date()) {
  const raw = Buffer.from(JSON.stringify({ type, created_at: occurredAt.toISOString(), data: { email_id: messageId } }));
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", Buffer.from(secret.slice(6), "base64")).update(`${id}.${timestamp}.`).update(raw).digest("base64");
  return [raw, { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": `v1,${signature}` }, secret];
}
test("notification lifecycle, signed receipts and bounded concurrent recovery", { skip: !isolated, timeout: 120000 }, async (t) => {
  await mongoose.connect(uri); assert.equal(mongoose.connection.name, "medreach_notification_lifecycle_test");
  await mongoose.connection.dropDatabase();
  await Promise.all([EmailDelivery, EmailWebhookEvent, AuditLog, User].map(M => M.init()));
  const previous = { ...env };
  Object.assign(env, { emailEnabled: true, emailProvider: "resend", resendApiKey: "mock-only", resendFrom: "sender@fixture.test", emailMaxAttempts: 3,
    emailEnvelopeKey: "dedicated-envelope-test-key-32-bytes", emailEnvelopePreviousKey: "" });
  t.after(async () => { Object.assign(env, previous); setEmailQueueEnabled(false); setResendFetchForTests(); setEmailTransportFactoryForTests(); await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  let sequence = 0;
  const send = (name) => sendEmailEvent({ eventKey: `${name}:${++sequence}`, to: "controlled@fixture.test", template: "welcome" });
  await t.test("acceptance is submitted and only a signed delivery event establishes delivered", async () => {
    setResendFetchForTests(async () => ({ ok: true, json: async () => ({ id: "provider-message-1" }) }));
    const result = await send("submitted"); assert.equal(result.status, "sent"); assert.equal(result.lifecycleStatus, "submitted"); assert.equal(result.deliveredAt, undefined);
    const args = webhook("msg_delivery_1", "provider-message-1", "email.delivered");
    assert.deepEqual(await acceptResendWebhook(...args), { received: true });
    assert.equal((await EmailDelivery.findById(result._id)).lifecycleStatus, "delivered");
    await Promise.all(Array.from({ length: 5 }, () => acceptResendWebhook(...args)));
    assert.equal(await EmailWebhookEvent.countDocuments({ webhookId: "msg_delivery_1" }), 1);
    assert.equal(await AuditLog.countDocuments({ entityId: result._id, "after.operation": "provider_webhook" }), 1);
  });
  await t.test("early delivery webhook is durable and reconciles when provider acceptance is stored", async () => {
    setResendFetchForTests(async () => {
      await acceptResendWebhook(...webhook("msg_early_1", "provider-early", "email.delivered"));
      assert.equal((await EmailWebhookEvent.findOne({ webhookId: "msg_early_1" })).status, "pending");
      return { ok: true, json: async () => ({ id: "provider-early" }) };
    });
    const result = await send("early"); assert.equal(result.lifecycleStatus, "delivered");
    assert.equal((await EmailWebhookEvent.findOne({ webhookId: "msg_early_1" })).status, "processed");
  });
  await t.test("late sent events never downgrade delivered and bounce is terminal", async () => {
    const base = new Date(Date.now() - 10000);
    const delivery = await EmailDelivery.create({ eventKey: "out-of-order", recipient: "controlled@fixture.test", template: "welcome", subject: "Test", status: "sent", lifecycleStatus: "submitted", provider: "resend", providerMessageId: "ordered-provider" });
    await acceptResendWebhook(...webhook("msg_order_delivered", "ordered-provider", "email.delivered", new Date(base.getTime() + 2000)));
    await acceptResendWebhook(...webhook("msg_order_old", "ordered-provider", "email.sent", base));
    await acceptResendWebhook(...webhook("msg_order_late", "ordered-provider", "email.sent", new Date(base.getTime() + 3000)));
    assert.equal((await EmailDelivery.findById(delivery._id)).lifecycleStatus, "delivered");
    await acceptResendWebhook(...webhook("msg_order_bounce", "ordered-provider", "email.bounced", new Date(base.getTime() + 4000)));
    await acceptResendWebhook(...webhook("msg_order_afterbounce", "ordered-provider", "email.delivered", new Date(base.getTime() + 5000)));
    assert.equal((await EmailDelivery.findById(delivery._id)).lifecycleStatus, "bounced");
    assert.equal((await retryEmailDelivery({ deliveryId: delivery._id })).status, 409);
  });
  await t.test("provider-reported failure is terminal even when the same event is submitted again", async () => {
    let submissions = 0;
    setResendFetchForTests(async () => { submissions++; return { ok: true, json: async () => ({ id: "unexpected-resubmission" }) }; });
    const row = await EmailDelivery.create({ eventKey: "provider-terminal-failure", recipient: "controlled@fixture.test", template: "welcome", subject: "Test", status: "sent", lifecycleStatus: "submitted", retryable: true, provider: "resend", providerMessageId: "terminal-failure-provider" });
    await acceptResendWebhook(...webhook("msg_terminal_failure", "terminal-failure-provider", "email.failed"));
    const repeated = await sendEmailEvent({ eventKey: row.eventKey, to: row.recipient, template: "welcome" });
    assert.equal(repeated.status, "failed"); assert.equal(repeated.lifecycleStatus, "failed"); assert.equal(submissions, 0);
    assert.equal((await retryEmailDelivery({ deliveryId: row._id })).status, 409);
  });
  await t.test("conflicting webhook ID cannot overwrite a persisted receipt", async () => {
    await acceptResendWebhook(...webhook("msg_conflict", "no-delivery-yet", "email.delivered"));
    assert.equal((await acceptResendWebhook(...webhook("msg_conflict", "different-message", "email.bounced"))).status, 409);
    const receipt = await EmailWebhookEvent.findOne({ webhookId: "msg_conflict" }); assert.equal(receipt.providerMessageId, "no-delivery-yet");
    assert.equal(receipt.toObject().payload, undefined);
  });
  await t.test("atomic retry budget survives many concurrent retries and manual retry", async () => {
    let attempts = 0;
    setResendFetchForTests(async () => { attempts++; return { ok: false, status: 429 }; });
    const failed = await send("retry-cap");
    for (let round = 0; round < 5; round++) await Promise.all(Array.from({ length: 12 }, () => retryEmailDelivery({ deliveryId: failed._id })));
    assert.equal(attempts, 3); assert.equal((await EmailDelivery.findById(failed._id)).attempts, 3);
    assert.ok((await EmailDelivery.findById(failed._id)).exhaustedAt instanceof Date);
    assert.equal((await EmailDelivery.findById(failed._id)).queued, false);
    assert.equal((await retryEmailDelivery({ deliveryId: failed._id })).code, "RETRY_LIMIT_REACHED");
  });
  await t.test("final active attempt is not exhausted prematurely and expired final lease stays uncertain", async () => {
    const row = await EmailDelivery.create({ eventKey: "final-active-attempt", recipient: "controlled@fixture.test", template: "welcome", subject: "Test", status: "pending", lifecycleStatus: "queued", retryable: true, retryEnvelope: "opaque", queued: true, attempts: 3, leaseUntil: new Date(Date.now() + 60000) });
    assert.equal((await retryEmailDelivery({ deliveryId: row._id })).code, "RETRY_LIMIT_REACHED");
    let stored = await EmailDelivery.findById(row._id);
    assert.equal(stored.status, "pending"); assert.equal(stored.exhaustedAt, undefined); assert.equal(stored.queued, true);
    await EmailDelivery.updateOne({ _id: row._id }, { $set: { leaseUntil: new Date(Date.now() - 1) } });
    await retryEmailDelivery({ deliveryId: row._id });
    stored = await EmailDelivery.findById(row._id);
    assert.equal(stored.status, "uncertain"); assert.equal(stored.exhaustedAt, undefined); assert.equal(stored.queued, false);
    const failed = await EmailDelivery.create({ eventKey: "historical-cap-failure", recipient: "controlled@fixture.test", template: "welcome", subject: "Test", status: "failed", lifecycleStatus: "failed", retryable: true, retryEnvelope: "opaque", queued: true, attempts: 3 });
    await retryEmailDelivery({ deliveryId: failed._id });
    assert.ok((await EmailDelivery.findById(failed._id)).exhaustedAt instanceof Date);
    assert.equal((await EmailDelivery.findById(failed._id)).queued, false);
  });
  await t.test("expired in-flight lease becomes uncertain without repeating a possible send", async () => {
    let attempts = 0; setResendFetchForTests(async () => { attempts++; throw new Error("must not send"); });
    const row = await EmailDelivery.create({ eventKey: "crashed-worker", recipient: "controlled@fixture.test", template: "welcome", subject: "Test", status: "pending", lifecycleStatus: "queued", retryable: true, retryEnvelope: "opaque", attempts: 1, leaseUntil: new Date(Date.now() - 1) });
    assert.equal((await retryEmailDelivery({ deliveryId: row._id })).status, 409);
    const stored = await EmailDelivery.findById(row._id); assert.equal(stored.lifecycleStatus, "uncertain"); assert.equal(stored.queued, false); assert.equal(attempts, 0);
  });
  await t.test("dedicated encryption survives JWT rotation without exposing bodies", async () => {
    setEmailQueueEnabled(true); const queued = await send("rotation"); setEmailQueueEnabled(false);
    const row = await EmailDelivery.findById(queued._id).select("+retryEnvelope"); assert.equal(JSON.parse(row.retryEnvelope).version, 2); assert.equal(row.retryEnvelope.includes("Hello"), false);
    env.jwtSecret = "rotated-unrelated-jwt-key";
    setResendFetchForTests(async () => ({ ok: true, json: async () => ({ id: "rotation-provider" }) }));
    assert.equal((await retryEmailDelivery({ deliveryId: queued._id })).delivery.lifecycleStatus, "submitted");
  });
  await t.test("sensitive links remain nonreplayable and uncertain outcome needs authorised review", async () => {
    setResendFetchForTests(async () => { throw new Error("ambiguous-send"); });
    const result = await sendEmailEvent({ eventKey: "activation-nonreplay", to: "controlled@fixture.test", template: "provider_activation", data: { url: "https://fixture.test/activate?token=DO_NOT_PERSIST" } });
    const stored = await EmailDelivery.findById(result._id).select("+retryEnvelope"); assert.equal(stored.lifecycleStatus, "uncertain"); assert.equal(stored.retryEnvelope, undefined); assert.equal(JSON.stringify(stored).includes("DO_NOT_PERSIST"), false);
    assert.equal((await resolveEmailDelivery({ deliveryId: result._id, resolution: "cancelled", reason: "Verified in provider console" })).status, 403);
    const admin = await User.create({ name: "Lifecycle Admin", email: "admin@fixture.test", role: "system_admin", accountStatus: "active" });
    assert.equal((await resolveEmailDelivery({ deliveryId: result._id, actorId: admin._id, resolution: "cancelled", reason: "Verified in provider console" })).delivery.recoveryResolution, "cancelled");
    assert.equal((await retryEmailDelivery({ deliveryId: result._id })).status, 409);
    assert.equal(await AuditLog.countDocuments({ entityId: result._id, "after.operation": "resolve_delivery" }), 1);
  });
  await t.test("equal event timestamps prefer delivery over submission", async () => {
    const at = new Date(Date.now() - 5000);
    const row = await EmailDelivery.create({ eventKey: "equal-time", recipient: "controlled@fixture.test", template: "welcome", subject: "Test", status: "sent", lifecycleStatus: "submitted", provider: "resend", providerMessageId: "equal-time-provider", providerEventAt: at });
    await acceptResendWebhook(...webhook("msg_equal", "equal-time-provider", "email.delivered", at));
    assert.equal((await EmailDelivery.findById(row._id)).lifecycleStatus, "delivered");
  });
  await t.test("event identity binds recipient and prevents reusing an event for another address", async () => {
    let sends = 0; setResendFetchForTests(async () => { sends++; return { ok: false, status: 429 }; });
    const first = await sendEmailEvent({ eventKey: "bound-event", to: "controlled@fixture.test", template: "welcome" });
    const conflict = await sendEmailEvent({ eventKey: "bound-event", to: "another@fixture.test", template: "welcome" });
    assert.equal(conflict.errorCode, "EMAIL_EVENT_CONFLICT"); assert.equal(sends, 1);
    assert.equal((await EmailDelivery.findById(first._id)).recipient, "controlled@fixture.test");
    assert.equal((await sendEmailEvent({ eventKey: "invalid-to", to: "not-an-email", template: "welcome" })).errorCode, "INVALID_EMAIL_EVENT");
    assert.equal(await EmailDelivery.countDocuments({ eventKey: "invalid-to" }), 0);
  });
  await t.test("SMTP ambiguous DATA outcome never retries automatically and rejection is a failure", async () => {
    env.emailProvider = "smtp"; env.smtpHost = "mock.fixture.test"; env.smtpFrom = "sender@fixture.test";
    let sends = 0; setEmailTransportFactoryForTests(() => ({ async sendMail() { sends++; throw Object.assign(new Error("private SMTP details"), { code: "ECONNRESET", command: "DATA" }); } }));
    const uncertain = await send("smtp-ambiguous"); assert.equal(uncertain.lifecycleStatus, "uncertain");
    assert.equal((await retryEmailDelivery({ deliveryId: uncertain._id })).status, 409); assert.equal(sends, 1);
    setEmailTransportFactoryForTests(() => ({ async sendMail() { return { rejected: ["controlled@fixture.test"] }; } }));
    const failed = await send("smtp-rejected"); assert.equal(failed.status, "failed"); assert.equal(failed.errorCode, "SMTP_RECIPIENT_REJECTED");
    env.emailProvider = "resend";
  });
  await t.test("bound recipients lose retry eligibility after suspension, contact changes or preference withdrawal", async () => {
    setEmailQueueEnabled(true);
    const user = await User.create({ name: "Bound recipient", email: "bound@fixture.test", emailVerifiedAt: new Date(), accountStatus: "active", notificationEmail: "notice@fixture.test", notificationEmailVerifiedAt: new Date(), notificationsEnabled: true });
    const queued = await sendEmailEvent({ eventKey: "bound-notification", to: user.notificationEmail, template: "welcome", recipientUser: user._id, recipientContactPolicy: "notification" });
    const account = await sendEmailEvent({ eventKey: "bound-account", to: user.email, template: "welcome", recipientUser: user._id, recipientContactPolicy: "account" });
    setEmailQueueEnabled(false);
    await User.updateOne({ _id: user._id }, { $set: { notificationsEnabled: false } });
    assert.equal((await retryEmailDelivery({ deliveryId: queued._id })).code, "RECIPIENT_NO_LONGER_ELIGIBLE");
    await User.updateOne({ _id: user._id }, { $set: { notificationsEnabled: true, notificationEmail: "replacement@fixture.test", email: "replacement-account@fixture.test" } });
    assert.equal((await retryEmailDelivery({ deliveryId: queued._id })).code, "RECIPIENT_NO_LONGER_ELIGIBLE");
    assert.equal((await retryEmailDelivery({ deliveryId: account._id })).code, "RECIPIENT_NO_LONGER_ELIGIBLE");
    await User.updateOne({ _id: user._id }, { $set: { email: "bound@fixture.test", accountStatus: "suspended" } });
    assert.equal((await retryEmailDelivery({ deliveryId: account._id })).code, "RECIPIENT_NO_LONGER_ELIGIBLE");
    assert.equal((await EmailDelivery.findById(account._id)).attempts, 0);
  });
  await t.test("provider transition audit recovers after the lifecycle CAS and audit write is idempotent", async () => {
    const delivery = await EmailDelivery.create({ eventKey: "webhook-audit-crash", recipient: "controlled@fixture.test", template: "welcome", subject: "Test", status: "sent", lifecycleStatus: "submitted", provider: "resend", providerMessageId: "audit-crash-provider" });
    const args = webhook("msg_audit_crash", "audit-crash-provider", "email.delivered");
    const auditUpdate = AuditLog.updateOne;
    AuditLog.updateOne = () => { throw new Error("synthetic audit outage after delivery update"); };
    try { await assert.rejects(() => acceptResendWebhook(...args), /synthetic audit outage/); }
    finally { AuditLog.updateOne = auditUpdate; }
    assert.equal((await EmailDelivery.findById(delivery._id)).lifecycleStatus, "delivered");
    assert.equal((await EmailWebhookEvent.findOne({ webhookId: "msg_audit_crash" })).status, "pending");
    await reconcileWebhookEvents({ providerMessageId: "audit-crash-provider", now: new Date(Date.now() + 60000) });
    await Promise.all(Array.from({ length: 5 }, () => acceptResendWebhook(...args)));
    assert.equal((await EmailWebhookEvent.findOne({ webhookId: "msg_audit_crash" })).status, "processed");
    assert.equal(await AuditLog.countDocuments({ entityId: delivery._id, "after.operation": "provider_webhook" }), 1);
    const audit = await AuditLog.findOne({ entityId: delivery._id });
    assert.equal(audit.after.reportedLifecycleStatus, "delivered");
  });
  await t.test("bounded email sweep marks stale final attempts uncertain, cap failures exhausted, and preserves active leases", async () => {
    const make = (eventKey, extra) => EmailDelivery.create({ eventKey, recipient: "controlled@fixture.test", template: "welcome", subject: "Test", status: "pending", lifecycleStatus: "queued", retryable: true, queued: true, attempts: 3, ...extra });
    const expired = await make("sweep-final-expired", { leaseUntil: new Date(Date.now() - 1) });
    const active = await make("sweep-final-active", { leaseUntil: new Date(Date.now() + 60000) });
    const failed = await make("sweep-failed-cap", { status: "failed", lifecycleStatus: "failed" });
    const result = await reconcileEmailDeliveryLeases();
    assert.ok(result.uncertain >= 1); assert.ok(result.exhausted >= 1);
    assert.equal((await EmailDelivery.findById(expired._id)).status, "uncertain");
    assert.equal((await EmailDelivery.findById(expired._id)).exhaustedAt, undefined);
    assert.equal((await EmailDelivery.findById(active._id)).status, "pending");
    assert.ok((await EmailDelivery.findById(failed._id)).exhaustedAt instanceof Date);
    assert.equal((await EmailDelivery.findById(failed._id)).queued, false);
  });
  await t.test("unmatched signed events back off without consuming failures, then age out after 24 hours", async () => {
    await acceptResendWebhook(...webhook("msg_orphan_age", "provider-never-recorded", "email.delivered"));
    let receipt = await EmailWebhookEvent.findOne({ webhookId: "msg_orphan_age" });
    assert.equal(receipt.attempts, 0); assert.ok(receipt.retryAt instanceof Date);
    await reconcileWebhookEvents({ now: new Date(Date.now() + 120000) });
    receipt = await EmailWebhookEvent.findById(receipt._id);
    assert.equal(receipt.attempts, 0); assert.equal(receipt.status, "pending");
    await reconcileWebhookEvents({ now: new Date(Date.now() + 86400001) });
    receipt = await EmailWebhookEvent.findById(receipt._id);
    assert.equal(receipt.status, "exhausted"); assert.equal(receipt.errorCode, "WEBHOOK_MESSAGE_UNMATCHED");
    assert.ok(receipt.exhaustedAt instanceof Date);
  });
  await t.test("webhook processing outages stop at five attempts and expose manual attention", async () => {
    await EmailDelivery.create({ eventKey: "webhook-permanent-audit-failure", recipient: "controlled@fixture.test", template: "welcome", subject: "Test", status: "sent", lifecycleStatus: "submitted", provider: "resend", providerMessageId: "audit-budget-provider" });
    const args = webhook("msg_audit_budget", "audit-budget-provider", "email.delivered");
    const auditUpdate = AuditLog.updateOne; AuditLog.updateOne = () => { throw new Error("synthetic persistent audit outage"); };
    try {
      await assert.rejects(() => acceptResendWebhook(...args));
      for (let step = 1; step < 5; step++) await assert.rejects(() => reconcileWebhookEvents({ providerMessageId: "audit-budget-provider", now: new Date(Date.now() + step * 600000) }));
      assert.equal((await reconcileWebhookEvents({ providerMessageId: "audit-budget-provider", now: new Date(Date.now() + 3600000) })).processed, 0);
    } finally { AuditLog.updateOne = auditUpdate; }
    const receipt = await EmailWebhookEvent.findOne({ webhookId: "msg_audit_budget" });
    assert.equal(receipt.status, "exhausted"); assert.equal(receipt.attempts, 5); assert.ok(receipt.exhaustedAt instanceof Date);
  });
  await t.test("unknown signed event is recorded without changing delivery", async () => {
    await acceptResendWebhook(...webhook("msg_ignored", "ignored-provider", "email.opened"));
    assert.equal((await EmailWebhookEvent.findOne({ webhookId: "msg_ignored" })).status, "ignored");
    assert.equal((await reconcileWebhookEvents()).processed, 0);
  });
});
