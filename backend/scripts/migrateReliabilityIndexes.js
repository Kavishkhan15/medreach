import { connectDB, disconnectDB } from "../src/config/db.js";
import { EmergencyRequest } from "../src/models/EmergencyRequest.js";
import { BloodRequest } from "../src/models/BloodRequest.js";
import { AmbulanceBooking } from "../src/models/AmbulanceBooking.js";
import { JobApplication } from "../src/models/JobApplication.js";
import { OrganizationApplication } from "../src/models/OrganizationApplication.js";
import { EmailDelivery } from "../src/models/EmailDelivery.js";

const models = [
  EmergencyRequest,
  BloodRequest,
  AmbulanceBooking,
  JobApplication,
  OrganizationApplication,
  EmailDelivery,
];

try {
  await connectDB();
  for (const model of models) {
    await model.createIndexes();
    console.log(`[medreach] reliability indexes ready: ${model.collection.collectionName}`);
  }
} finally {
  await disconnectDB();
}
