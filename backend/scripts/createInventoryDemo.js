import mongoose from "mongoose";
import { assertInventoryDemoTarget, createInventoryDemo } from "../src/services/inventoryDemo.js";

// No env-file loading: the operator must explicitly identify the isolated target.
const uri = process.env.MEDREACH_INVENTORY_DEMO_MONGO_URI;
let client;
try {
  const database = assertInventoryDemoTarget(uri);
  client = new mongoose.mongo.MongoClient(uri, { serverSelectionTimeoutMS: 5000, maxPoolSize: 2, appName: "medreach-isolated-inventory-demo" });
  await client.connect();
  console.log(JSON.stringify(await createInventoryDemo(client.db(database), { uri }), null, 2));
} catch {
  console.error("Inventory demo was refused or interrupted. Explicit isolated loopback target, development/test mode and EMAIL_ENABLED=false are required. Existing records are never overwritten; review the target before retrying.");
  process.exitCode = 1;
} finally { await client?.close(); }
