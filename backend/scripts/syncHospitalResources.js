import { connectDB, disconnectDB } from "../src/config/db.js";
import { syncHospitalResources } from "../src/services/syncHospitalResources.js";
await connectDB();
try { console.log(await syncHospitalResources()); }
finally { await disconnectDB(); }
