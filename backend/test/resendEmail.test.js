import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectDB, disconnectDB } from "../src/config/db.js";
import { env } from "../src/config/env.js";
import {
  emailConfiguration,
  sendEmailEvent,
  setResendClientForTests,
  setEmailTransportFactoryForTests,
} from "../src/services/emailService.js";

const testDbUri = "mongodb://127.0.0.1:27017/medreach_resend_email_test";

test("Resend email authentication and delivery test suite", async (t) => {
  const originalEnv = {
    emailEnabled: env.emailEnabled,
    emailProvider: env.emailProvider,
    resendApiKey: env.resendApiKey,
    brevoApiKey: env.brevoApiKey,
    smtpHost: env.smtpHost,
    smtpPort: env.smtpPort,
    smtpUser: env.smtpUser,
    smtpPassword: env.smtpPassword,
    smtpFrom: env.smtpFrom,
    smtpFromName: env.smtpFromName,
  };

  t.before(async () => {
    await connectDB(testDbUri);
    await mongoose.connection.dropDatabase();
  });

  t.after(async () => {
    Object.assign(env, originalEnv);
    setResendClientForTests();
    setEmailTransportFactoryForTests();
    try {
      if (mongoose.connection?.readyState === 1) {
        await mongoose.connection.dropDatabase();
      }
      await disconnectDB();
    } catch {
      // ignore
    }
  });

  await t.test("emailConfiguration reports Resend provider when configured via API or SMTP", () => {
    // Disabled state
    env.emailEnabled = false;
    env.resendApiKey = "";
    env.brevoApiKey = "";
    env.smtpHost = "";
    env.smtpFrom = "";
    env.emailProvider = "";
    assert.deepEqual(emailConfiguration(), {
      enabled: false,
      configured: false,
      provider: "none",
      mode: "disabled",
    });

    // Enabled with Resend REST API key
    env.emailEnabled = true;
    env.resendApiKey = "re_123456789_test_key";
    env.smtpFrom = "alerts@medreach.org";
    assert.deepEqual(emailConfiguration(), {
      enabled: true,
      configured: true,
      provider: "resend",
      mode: "resend",
    });

    // Enabled with Resend SMTP relay
    env.resendApiKey = "";
    env.smtpHost = "smtp.resend.com";
    assert.deepEqual(emailConfiguration(), {
      enabled: true,
      configured: true,
      provider: "resend",
      mode: "resend",
    });

    // Enabled with EMAIL_PROVIDER=resend
    env.smtpHost = "smtp.custom-host.test";
    env.emailProvider = "resend";
    assert.deepEqual(emailConfiguration(), {
      enabled: true,
      configured: true,
      provider: "resend",
      mode: "resend",
    });
  });

  await t.test("sendEmailEvent dispatches via Resend REST API when resendApiKey is set", async () => {
    env.emailEnabled = true;
    env.resendApiKey = "re_mock_test_key";
    env.brevoApiKey = "";
    env.smtpFrom = "no-reply@medreach.org";
    env.smtpFromName = "MedReach Emergency";

    let capturedPayload = null;
    setResendClientForTests(async (payload) => {
      capturedPayload = payload;
      return { id: "resend-msg-uuid-1234" };
    });

    const delivery = await sendEmailEvent({
      eventKey: "resend-api-test-01",
      to: "patient@medreach.test",
      template: "welcome",
      data: { name: "Aarav" },
    });

    assert.equal(delivery.status, "sent");
    assert.ok(delivery.sentAt instanceof Date);
    assert.equal(capturedPayload.to, "patient@medreach.test");
    assert.equal(capturedPayload.fromName, "MedReach Emergency");
    assert.equal(capturedPayload.fromEmail, "no-reply@medreach.org");
    assert.equal(capturedPayload.subject, "Welcome to MedReach");
    assert.match(capturedPayload.text, /Hello Aarav/);
  });

  await t.test("sendEmailEvent handles Resend REST API authentication failure safely", async () => {
    env.emailEnabled = true;
    env.resendApiKey = "re_invalid_secret_key";
    env.brevoApiKey = "";
    env.smtpFrom = "no-reply@medreach.org";

    setResendClientForTests(async () => {
      const err = new Error("Invalid API key re_invalid_secret_key");
      err.code = "EAUTH";
      throw err;
    });

    const delivery = await sendEmailEvent({
      eventKey: "resend-api-auth-fail",
      to: "patient@medreach.test",
      template: "verify_email",
      data: { url: "https://medreach.org/verify?token=xyz" },
    });

    assert.equal(delivery.status, "failed");
    assert.equal(delivery.errorCode, "EAUTH");
    assert.equal(delivery.lastError, "Email authentication failed");
    // Ensure API keys are never leaked into the saved error
    assert.equal(JSON.stringify(delivery).includes("re_invalid_secret_key"), false);
  });

  await t.test("sendEmailEvent falls back to Resend SMTP relay when API key is unset", async () => {
    env.emailEnabled = true;
    env.resendApiKey = "";
    env.brevoApiKey = "";
    env.emailProvider = "resend";
    env.smtpHost = "smtp.resend.com";
    env.smtpPort = 587;
    env.smtpUser = "resend";
    env.smtpPassword = "re_smtp_password";
    env.smtpFrom = "notifications@medreach.org";
    env.smtpFromName = "MedReach System";

    let capturedMail = null;
    setEmailTransportFactoryForTests(() => ({
      sendMail: async (mail) => {
        capturedMail = mail;
        return { messageId: "resend-smtp-ok" };
      },
    }));

    const delivery = await sendEmailEvent({
      eventKey: "resend-smtp-test-01",
      to: "doctor@hospital.test",
      template: "password_reset",
      data: { url: "https://medreach.org/reset?token=abc" },
    });

    assert.equal(delivery.status, "sent");
    assert.ok(delivery.sentAt instanceof Date);
    assert.equal(capturedMail.to, "doctor@hospital.test");
    assert.deepEqual(capturedMail.from, {
      name: "MedReach System",
      address: "notifications@medreach.org",
    });
    assert.equal(capturedMail.subject, "Reset your MedReach password");
  });
});
