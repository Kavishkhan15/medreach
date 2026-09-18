import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectDB, disconnectDB } from "../src/config/db.js";
import { env } from "../src/config/env.js";
import {
  emailConfiguration,
  sendEmailEvent,
  setEmailTransportFactoryForTests,
} from "../src/services/emailService.js";

const testDbUri = "mongodb://127.0.0.1:27017/medreach_google_email_test";

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
  };

  t.before(async () => {
    await connectDB(testDbUri);
    await mongoose.connection.dropDatabase();
  });

  t.after(async () => {
    Object.assign(env, originalEnv);
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
    assert.deepEqual(emailConfiguration(), {
      enabled: true,
      configured: true,
      provider: "google",
      mode: "google",
    });

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
});
