/**
 * register-platform.js
 *
 * Run ONCE after initial deployment to register your Moodle instance with LTIJS.
 *
 *   npm run register-platform
 *
 * You will need the values from Moodle's External Tool configuration page.
 * In Moodle: Site Administration → Plugins → Activity modules → External tool → Manage tools
 *
 * Required environment variables (same .env as server.js):
 *   LTI_KEY, MONGODB_URL
 *
 * Moodle-specific values — fill these in below or pass as env vars:
 *   MOODLE_URL          e.g. https://moodle.example.com
 *   MOODLE_CLIENT_ID    the Client ID Moodle generated for your External Tool
 */

require("dotenv").config();
const lti = require("ltijs").Provider;

const MOODLE_URL = process.env.MOODLE_URL ?? "https://moodle.example.com";
const CLIENT_ID  = process.env.MOODLE_CLIENT_ID ?? "REPLACE_WITH_CLIENT_ID";

async function main() {
  // Connect LTIJS to the database (no need to deploy/listen)
  await lti.setup(
    process.env.LTI_KEY,
    { url: process.env.MONGODB_URL },
    { devMode: true }
  );
  await lti.deploy({ serverless: true }); // connect DB only, no HTTP server

  const platform = await lti.registerPlatform({
    url: MOODLE_URL,
    name: "Moodle",
    clientId: CLIENT_ID,

    // Standard Moodle LTI 1.3 endpoints:
    authenticationEndpoint: `${MOODLE_URL}/mod/lti/auth.php`,
    accesstokenEndpoint:    `${MOODLE_URL}/mod/lti/token.php`,
    authConfig: {
      method: "JWK_SET",
      key: `${MOODLE_URL}/mod/lti/certs.php`,
    },
  });

  console.log("Platform registered:");
  console.log("  Name     :", platform.platformName);
  console.log("  URL      :", MOODLE_URL);
  console.log("  ClientID :", CLIENT_ID);
  console.log("\nDone. Restart the server and the LTI tool is ready.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Registration failed:", err);
  process.exit(1);
});
