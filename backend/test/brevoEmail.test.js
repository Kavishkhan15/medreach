import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectDB, disconnectDB } from "../src/config/db.js";
import { env } from "../src/config/env.js";
import {
  emailConfiguration,
  sendEmailEvent,
  setBrevoClientForTests,
  setEmailTransportFactoryForTests,
} from "../src/services/emailService.js";
import { EmailDelivery } from "../src/models/EmailDelivery.js";

const testDbUri = "mongodb://127.0.0.1:27017/medreach_email_test";

test("Brevo (Bravo) email authentication and delivery test suite", async (t) => {
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
    env.resendApiKey = "";
    await connectDB(testDbUri);
    await mongoose.connection.dropDatabase();
  });

  t.after(async () => {
    // Restore env and mocks
    Object.assign(env, originalEnv);
    setBrevoClientForTests();
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

  await t.test("emailConfiguration reports Brevo provider when configured via API or SMTP", () => {
    // Disabled state
    env.emailEnabled = false;
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

    // Enabled with Brevo REST API key
    env.emailEnabled = true;
    env.brevoApiKey = "xkeysib-test-brevo-key";
    env.smtpFrom = "alerts@medreach.org";
    assert.deepEqual(emailConfiguration(), {
      enabled: true,
      configured: true,
      provider: "brevo",
      mode: "brevo",
    });

    // Enabled with Brevo SMTP relay
    env.brevoApiKey = "";
    env.smtpHost = "smtp-relay.brevo.com";
    assert.deepEqual(emailConfiguration(), {
      enabled: true,
      configured: true,
      provider: "brevo",
      mode: "brevo",
    });

    // Enabled with EMAIL_PROVIDER=bravo alias
    env.smtpHost = "smtp.custom-relay.org";
    env.emailProvider = "bravo";
    assert.deepEqual(emailConfiguration(), {
      enabled: true,
      configured: true,
      provider: "brevo",
      mode: "brevo",
    });
  });

  await t.test("sendEmailEvent dispatches via Brevo REST API when brevoApiKey is set", async () => {
    env.emailEnabled = true;
    env.brevoApiKey = "xkeysib-mock-key-12345";
    env.smtpFrom = "no-reply@medreach.org";
    env.smtpFromName = "MedReach Emergency";

    let capturedPayload = null;
    setBrevoClientForTests(async (payload) => {
      capturedPayload = payload;
      return { messageId: "brevo-msg-123" };
    });

    const delivery = await sendEmailEvent({
      eventKey: "brevo-api-test-01",
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

  await t.test("sendEmailEvent handles Brevo REST API authentication failure safely", async () => {
    env.emailEnabled = true;
    env.brevoApiKey = "invalid-key";
    env.smtpFrom = "no-reply@medreach.org";

    setBrevoClientForTests(async () => {
      const err = new Error("Key not found");
      err.code = "EAUTH";
      throw err;
    });

    const delivery = await sendEmailEvent({
      eventKey: "brevo-api-auth-fail",
      to: "patient@medreach.test",
      template: "verify_email",
      data: { url: "https://medreach.org/verify?token=xyz" },
    });

    assert.equal(delivery.status, "failed");
    assert.equal(delivery.errorCode, "EAUTH");
    assert.equal(delivery.lastError, "Email authentication failed");
    // Ensure API keys are never leaked into the saved error
    assert.equal(JSON.stringify(delivery).includes("invalid-key"), false);
  });

  await t.test("sendEmailEvent falls back to Brevo SMTP relay when API key is unset", async () => {
    env.emailEnabled = true;
    env.brevoApiKey = "";
    env.emailProvider = "brevo";
    env.smtpHost = "smtp-relay.brevo.com";
    env.smtpPort = 587;
    env.smtpUser = "brevo-smtp-login";
    env.smtpPassword = "brevo-master-key";
    env.smtpFrom = "notifications@medreach.org";
    env.smtpFromName = "MedReach System";

    let capturedMail = null;
    setEmailTransportFactoryForTests(() => ({
      sendMail: async (mail) => {
        capturedMail = mail;
        return { messageId: "smtp-relay-ok" };
      },
    }));

    const delivery = await sendEmailEvent({
      eventKey: "brevo-smtp-test-01",
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
