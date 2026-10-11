import { ProviderMembership } from "../src/models/ProviderMembership.js";
import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { connectDB, disconnectDB } from "../src/config/db.js";
import { env } from "../src/config/env.js";
import { AmbulanceBooking } from "../src/models/AmbulanceBooking.js";
import { EmailDelivery } from "../src/models/EmailDelivery.js";
import { ResourceProvider } from "../src/models/ResourceProvider.js";
import { User } from "../src/models/User.js";
import { setEmailTransportFactoryForTests } from "../src/services/emailService.js";
import { signSessionToken } from "./helpers/session.js";

const testDbUri =
  process.env.MEDREACH_TEST_MONGO_URI ||
  "mongodb://127.0.0.1:27017/medreach_ambulance_booking_test";

test("durable ambulance booking workflow", async (t) => {
  const originalEmail = {
    emailEnabled: env.emailEnabled,
    smtpHost: env.smtpHost,
    smtpFrom: env.smtpFrom,
  };
  const app = createApp();

  t.before(async () => {
    await connectDB(testDbUri);
    await mongoose.connection.dropDatabase();
    env.emailEnabled = true;
    env.smtpHost = "smtp.example.test";
    env.smtpFrom = "sender@example.test";
  });

  t.after(async () => {
    setEmailTransportFactoryForTests();
    Object.assign(env, originalEmail);
    await mongoose.connection.dropDatabase();
    await disconnectDB();
  });

  await t.test("provider email is optional, normalized, and validated", async () => {
    const valid = new ResourceProvider({
      kind: "ambulance",
      name: "Validated Ambulance",
      sourceName: "Test registry",
      email: "  DISPATCH@EXAMPLE.COM ",
    });
    assert.equal(valid.validateSync(), undefined);
    assert.equal(valid.email, "dispatch@example.com");
    await valid.save();

    const publicProvider = await ResourceProvider.findById(valid._id).lean();
    assert.equal(publicProvider.email, undefined);
    const privateProvider = await ResourceProvider.findById(valid._id).select("+email").lean();
    assert.equal(privateProvider.email, "dispatch@example.com");

    const invalid = new ResourceProvider({
      kind: "ambulance",
      name: "Invalid Ambulance",
      sourceName: "Test registry",
      email: "not-an-email",
    });
    assert.ok(invalid.validateSync()?.errors?.email);
  });

  await t.test("persists before notifications and reports each delivery truthfully", async () => {
    const provider = await ResourceProvider.create({
      kind: "ambulance",
      name: "No Email Ambulance",
      phone: "+91-90000-00000",
      sourceName: "Test registry",
    });

    setEmailTransportFactoryForTests(() => ({
      sendMail: async ({ subject }) => {
        const reference = subject.match(/AMB-[A-Z0-9-]+/)?.[0];
        assert.ok(reference, "email subject should include the booking reference");
        assert.ok(
          await AmbulanceBooking.exists({ reference }),
          "booking must be durable before any email attempt",
        );
        return { messageId: "test-message" };
      },
    }));

    const response = await request(app).post("/api/ambulances/book").send({
      providerId: provider.id,
      providerName: "Spoofed Client Name",
      providerEmail: "spoofed@example.com",
      patientName: "Patient One",
      patientAge: 45,
      ambulanceRequired: true,
      bookingPickup: "Bandra West",
      contactEmail: "patient@example.com",
      contactPhone: "+91-98888-00000",
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.recorded, true);
    assert.equal(response.body.message, "Ambulance booking request recorded.");
    assert.ok(response.body.reference.startsWith("AMB-"));
    assert.ok(response.body.trackingToken, "guest receives a private tracking token once");
    assert.equal(response.body.delivery.user.status, "sent");
    assert.equal(response.body.delivery.admin.status, "not_available");
    assert.equal(response.body.delivery.provider.status, "not_available");
    assert.equal(response.body.delivery.provider.attempted, false);
    assert.equal(response.body.booking.providerName, provider.name);
    assert.equal(response.body.booking.patientName, "Patient One");
    assert.equal(response.body.booking.status, "RECORDED");
    assert.equal(JSON.stringify(response.body.booking).includes("dispatch@example.com"), false);
    assert.doesNotMatch(JSON.stringify(response.body), /provider notified/i);

    const stored = await AmbulanceBooking.findOne({ reference: response.body.reference })
      .select("+trackingTokenHash")
      .lean();
    assert.ok(stored);
    assert.equal(stored.providerSnapshot.name, provider.name);
    assert.equal(stored.providerSnapshot.email, undefined);
    assert.equal(stored.delivery.provider.status, "not_available");
    assert.ok(stored.trackingTokenHash);
    assert.notEqual(stored.trackingTokenHash, response.body.trackingToken);
    assert.equal(await EmailDelivery.countDocuments({ template: "ambulance_booking_provider_notification" }), 0);

    const denied = await request(app).get(`/api/ambulances/bookings/${response.body.reference}`);
    assert.equal(denied.status, 403);

    const tracked = await request(app)
      .get(`/api/ambulances/bookings/${response.body.reference}`)
      .set("X-MedReach-Tracking-Token", response.body.trackingToken);
    assert.equal(tracked.status, 200);
    assert.equal(tracked.body.booking.reference, response.body.reference);
    assert.equal("trackingTokenHash" in tracked.body.booking, false);
  });

  await t.test("attempts provider delivery only for an active ambulance provider and stores failure", async () => {
    const provider = await ResourceProvider.create({
      kind: "ambulance",
      name: "Email Ambulance",
      email: "dispatch@example.com",
      phone: "+91-91111-11111",
      sourceName: "Test registry",
      active: true,
    });

    const staff = await User.create({ name: "Ambulance representative", email: "login@ambulance.example", role: "provider_admin", notificationsEnabled: true, notificationEmail: "dispatch@example.com", notificationEmailVerifiedAt: new Date() });
    await ProviderMembership.create({ user: staff._id, kind: "ambulance", organization: provider._id, assignedBy: staff._id });
    setEmailTransportFactoryForTests(() => ({
      sendMail: async ({ to }) => {
        if (to === provider.email) {
          const error = new Error("provider mailbox unavailable");
          error.code = "EDELIVERY";
          throw error;
        }
        return { messageId: "test-message" };
      },
    }));

    const response = await request(app).post("/api/ambulances/book").send({
      providerId: provider.id,
      patientName: "Patient Two",
      patientAge: 61,
      ambulanceRequired: true,
      bookingPickup: "Andheri East",
      contactEmail: "second@example.com",
      contactPhone: "+91-97777-00000",
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.delivery.user.status, "sent");
    assert.equal(response.body.delivery.admin.status, "not_available");
    assert.equal(response.body.delivery.provider.status, "failed");
    assert.equal(response.body.delivery.provider.attempted, true);
    assert.equal(response.body.delivery.provider.sent, false);
    assert.equal(JSON.stringify(response.body).includes(provider.email), false);

    const stored = await AmbulanceBooking.findOne({ reference: response.body.reference }).lean();
    assert.equal(stored.delivery.provider.status, "failed");
    assert.equal(stored.delivery.provider.errorCode, "EDELIVERY");
  });

  await t.test("rejects providers that are not active ambulance records", async () => {
    const inactive = await ResourceProvider.create({
      kind: "ambulance",
      name: "Inactive Ambulance",
      sourceName: "Test registry",
      active: false,
    });

    const response = await request(app).post("/api/ambulances/book").send({
      providerId: inactive.id,
      patientName: "Patient Three",
      patientAge: 20,
      bookingPickup: "Dadar",
      contactPhone: "+91-96666-00000",
    });

    assert.equal(response.status, 404);
    assert.match(response.body.error, /active ambulance provider/i);
  });

  await t.test("authenticated owners and administrators can recover bookings", async () => {
    const provider = await ResourceProvider.create({
      kind: "ambulance",
      name: "Owner Tracking Ambulance",
      sourceName: "Test registry",
    });
    const owner = new User({ name: "Booking Owner", email: "owner@example.com" });
    await owner.setPassword("SafePassword123");
    await owner.save();
    const other = new User({ name: "Other User", email: "other@example.com" });
    await other.setPassword("SafePassword123");
    await other.save();
    const admin = new User({ name: "Booking Admin", email: "admin@example.com", role: "system_admin" });
    await admin.setPassword("SafePassword123");
    await admin.save();

    env.emailEnabled = false;
    const created = await request(app)
      .post("/api/ambulances/book")
      .set("Authorization", `Bearer ${await signSessionToken(owner)}`)
      .send({
        providerId: provider.id,
        patientName: "Patient Four",
        patientAge: 35,
        bookingPickup: "Powai",
        contactPhone: "+91-95555-00000",
      });
    assert.equal(created.status, 201);
    assert.equal("trackingToken" in created.body, false);

    const ownerList = await request(app)
      .get("/api/ambulances/bookings")
      .set("Authorization", `Bearer ${await signSessionToken(owner)}`);
    assert.equal(ownerList.status, 200);
    assert.equal(ownerList.body.total, 1);
    assert.equal(ownerList.body.data[0].reference, created.body.reference);

    const denied = await request(app)
      .get(`/api/ambulances/bookings/${created.body.reference}`)
      .set("Authorization", `Bearer ${await signSessionToken(other)}`);
    assert.equal(denied.status, 403);

    const adminView = await request(app)
      .get(`/api/ambulances/bookings/${created.body.reference}`)
      .set("Authorization", `Bearer ${await signSessionToken(admin)}`);
    assert.equal(adminView.status, 200);
    assert.equal(adminView.body.booking.reference, created.body.reference);
  });
});
