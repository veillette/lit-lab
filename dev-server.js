/**
 * dev-server.js
 *
 * Development entry point only (not used in production).
 * Starts an in-memory MongoDB instance so you don't need a local MongoDB
 * installation. Then loads server.js as normal.
 *
 * Used by: npm run dev
 * Production uses: server.js directly (with a real MONGODB_URL in env).
 */

process.env.NODE_ENV = process.env.NODE_ENV ?? "development";

const { MongoMemoryServer } = require("mongodb-memory-server");

async function start() {
  // Start in-memory MongoDB and inject its URL into the environment
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URL = mongod.getUri();

  // Provide a default dev LTI key if none is set
  process.env.LTI_KEY =
    process.env.LTI_KEY ?? "dev_key_change_this_in_production_32chars!!";

  console.log("[dev] In-memory MongoDB started:", process.env.MONGODB_URL);

  // Shut down cleanly
  process.on("SIGINT", async () => {
    await mongod.stop();
    process.exit(0);
  });

  // Load the real server
  require("./server.js");
}

start().catch((err) => {
  console.error("Failed to start dev server:", err);
  process.exit(1);
});
