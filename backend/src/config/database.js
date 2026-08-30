// Target-architecture name for the DB connector. Re-exports config/db.js so
// existing imports (server.js, seed.js) keep working while new code can import
// from "./config/database.js".
export { connectDB, disconnectDB } from "./db.js";
