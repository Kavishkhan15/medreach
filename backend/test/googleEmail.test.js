import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectDB, disconnectDB } from "../src/config/db.js";
import { env } from "../src/config/env.js";
import {
  emailConfiguration,
  sendEmailEvent,
  setEmailTransportFactoryForTests,
  setResendFetchForTests,
} from "../src/services/emailService.js";

const testDbUri = process.env.MEDREACH_EMAIL_TEST_MONGO_URI || "mongodb://127.0.0.1:27017/medreach_google_email_test";

test("Google / Gmail SMTP email authentication and delivery test suite", async (t) => {
  const originalEnv = {
    emailEnabled: env.emailEnabled,
    emailProvider: env.emailProvider,
    smtpHost: env.smtpHost,
    smtpPort: env.smtpPort,
    smtpUser: env.smtpUser,
    smtpPassword: env.smtpPassword,
    smtpFrom: env.smtpFrom,
    smtpFromName: env.smtpFromName,
    resendApiKey: env.resendApiKey,
    resendFrom: env.resendFrom,
  };

  t.before(async () => {
    await connectDB(testDbUri);
    await mongoose.connection.dropDatabase();
  });

  t.after(async () => {
    Object.assign(env, originalEnv);
    setEmailTransportFactoryForTests();
    setResendFetchForTests();
    try {
      if (mongoose.connection?.readyState === 1) {
        await mongoose.connection.dropDatabase();
      }
      await disconnectDB();
    } catch {
      // ignore
    }
  });

  await t.test("emailConfiguration reports Google provider when configured for Gmail/Google SMTP", () => {
    // Disabled state
    env.emailEnabled = false;
    env.smtpHost = "";
    env.smtpFrom = "";
    env.emailProvider = "";
    assert.deepEqual(emailConfiguration(), {
      enabled: false,
      configured: false,
      provider: "none",
      mode: "disabled",
    });

    // Enabled with Google / Gmail SMTP
    env.emailEnabled = true;
    env.smtpHost = "smtp.gmail.com";
    env.smtpFrom = "medreach.alerts@gmail.com";
    env.emailProvider = "google";
    env.smtpUser = "";
    env.smtpPassword = "";
    assert.deepEqual(emailConfiguration(), {
      enabled: true,
      configured: false,
      provider: "google",
      mode: "google",
    });

    env.smtpUser = "medreach.alerts@gmail.com";
    env.smtpPassword = "google-app-password";
    assert.equal(emailConfiguration().configured, true);

    // Enabled with generic SMTP
    env.smtpHost = "mail.customhospital.org";
    env.smtpFrom = "alerts@customhospital.org";
    env.emailProvider = "smtp";
    assert.deepEqual(emailConfiguration(), {
      enabled: true,
      configured: true,
      provider: "smtp",
      mode: "smtp",
    });
  });

  await t.test("sendEmailEvent delivers transactional messages via Google SMTP transport", async () => {
    env.emailEnabled = true;
    env.smtpHost = "smtp.gmail.com";
    env.smtpPort = 587;
    env.smtpUser = "medreach.alerts@gmail.com";
    env.smtpPassword = "abcd efgh ijkl mnop";
    env.smtpFrom = "medreach.alerts@gmail.com";
    env.smtpFromName = "MedReach Emergency Support";

    let capturedMail = null;
    setEmailTransportFactoryForTests(() => ({
      sendMail: async (mail) => {
        capturedMail = mail;
        return { messageId: "google-smtp-msg-1234" };
      },
    }));

    const delivery = await sendEmailEvent({
      eventKey: "google-smtp-welcome-test",
      to: "patient@example.test",
      template: "welcome",
      data: { name: "Ananya" },
    });

    assert.equal(delivery.status, "sent");
    assert.ok(delivery.sentAt instanceof Date);
    assert.equal(capturedMail.to, "patient@example.test");
    assert.deepEqual(capturedMail.from, {
      name: "MedReach Emergency Support",
      address: "medreach.alerts@gmail.com",
    });
    assert.equal(capturedMail.subject, "Welcome to MedReach");
    assert.match(capturedMail.text, /Hello Ananya, your MedReach account is ready\./);
  });

  await t.test("sendEmailEvent handles Google SMTP authentication failure without credential leak", async () => {
    env.emailEnabled = true;
    env.smtpHost = "smtp.gmail.com";
    env.smtpFrom = "medreach.alerts@gmail.com";
    env.smtpPassword = "super-secret-app-password";

    setEmailTransportFactoryForTests(() => ({
      sendMail: async () => {
        const err = new Error("535 5.7.8 Username and Password not accepted super-secret-app-password");
        err.code = "EAUTH";
        throw err;
      },
    }));

    const delivery = await sendEmailEvent({
      eventKey: "google-smtp-auth-fail",
      to: "patient@example.test",
      template: "verify_email",
      data: { url: "http://localhost:3000/verify-email?token=xyz123" },
    });

    assert.equal(delivery.status, "failed");
    assert.equal(delivery.errorCode, "EAUTH");
    assert.equal(delivery.lastError, "SMTP authentication failed");
    assert.equal(JSON.stringify(delivery).includes("super-secret-app-password"), false);
  });

  await t.test("request confirmations do not claim unverified notification delivery", async () => {
    env.emailEnabled = true;
    env.smtpHost = "smtp.gmail.com";
    env.smtpFrom = "medreach.alerts@gmail.com";

    const captured = [];
    setEmailTransportFactoryForTests(() => ({
      sendMail: async (mail) => {
        captured.push(mail);
        return { messageId: `message-${captured.length}` };
      },
    }));

    await sendEmailEvent({
      eventKey: "truthful-emergency-confirmation",
      to: "patient@example.test",
      template: "emergency_submitted",
      data: { reference: "MR-TEST", hospital: "Test Hospital", connected: true },
    });
    await sendEmailEvent({
      eventKey: "truthful-blood-confirmation",
      to: "patient@example.test",
      template: "blood_request_confirmation",
      data: {
        type: "REQUEST",
        name: "Patient",
        bloodGroup: "O+",
        bloodBankName: "Test Blood Bank",
        reference: "BR-TEST",
      },
    });

    assert.equal(captured.length, 2);
    assert.doesNotMatch(captured[0].text, /staff were notified/i);
    assert.doesNotMatch(captured[1].text, /administrators were notified/i);
    assert.match(captured[0].text, /confirmation is pending/i);
    assert.match(captured[1].text, /recorded by MedReach/i);
  });

  await t.test("Resend uses HTTPS, a stable idempotency key and a verified-domain sender", async () => {
    Object.assign(env, { emailEnabled: true, emailProvider: "resend", resendApiKey: "isolated-test-key",
      resendFrom: "notifications@mail.medreachforyou.com", smtpFromName: "MedReach" });
    let request;
    setResendFetchForTests(async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ id: "resend-accepted-id" }) };
    });
    assert.deepEqual(emailConfiguration(), { enabled: true, configured: true, provider: "resend", mode: "resend" });
    const delivery = await sendEmailEvent({ eventKey: "resend-https-test", to: "controlled@example.test", template: "welcome" });
    assert.equal(delivery.status, "sent");
    assert.equal(request.url, "https://api.resend.com/emails");
    assert.equal(request.options.headers["Idempotency-Key"], String(delivery._id));
    assert.equal(JSON.parse(request.options.body).from, "MedReach <notifications@mail.medreachforyou.com>");
    assert.equal(JSON.stringify(delivery).includes("isolated-test-key"), false);
  });

  await t.test("Resend rejection fails safely and an unknown outcome stays uncertain", async () => {
    setResendFetchForTests(async () => ({ ok: false, status: 403 }));
    const rejected = await sendEmailEvent({ eventKey: "resend-rejected-test", to: "controlled@example.test", template: "welcome" });
    assert.equal(rejected.status, "failed");
    assert.equal(rejected.errorCode, "RESEND_HTTP_403");
    setResendFetchForTests(async () => { throw new Error("network outcome unknown isolated-test-key"); });
    const unknown = await sendEmailEvent({ eventKey: "resend-uncertain-test", to: "controlled@example.test", template: "welcome" });
    assert.equal(unknown.status, "uncertain");
    assert.equal(JSON.stringify(unknown).includes("isolated-test-key"), false);
  });
});
