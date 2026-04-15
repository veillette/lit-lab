require("dotenv").config();
const path = require("path");
const lti = require("ltijs").Provider;

const isProd = process.env.NODE_ENV === "production";

// ---------------------------------------------------------------------------
// 1. LTIJS setup
//    LTI_KEY      — random string, min 32 chars (encryption key for sessions)
//    MONGODB_URL  — MongoDB Atlas connection string
// ---------------------------------------------------------------------------
lti.setup(
  process.env.LTI_KEY,
  { url: process.env.MONGODB_URL },
  {
    appRoute: "/",
    loginRoute: "/login",
    cookies: {
      // In production (Cloud Run → HTTPS) Moodle embeds the tool in an iframe,
      // so cookies must be SameSite=None; Secure.
      secure: isProd,
      sameSite: isProd ? "None" : "",
    },
    // devMode skips HTTPS requirement — safe for local dev only
    devMode: !isProd,
  }
);

// ---------------------------------------------------------------------------
// 2. Whitelist /book/* so the textbook is readable without an LTI session.
//    Only /api/grade requires a valid session (needs the Moodle token anyway).
// ---------------------------------------------------------------------------
lti.whitelist({ route: new RegExp(/^\/book/), method: "get" });

const siteDir = path.join(__dirname, "_site");
lti.app.use("/book", require("express").static(siteDir));

// ---------------------------------------------------------------------------
// 3. Grade passback API
// ---------------------------------------------------------------------------
lti.app.use("/api", require("./server/routes/grade"));

// ---------------------------------------------------------------------------
// 4. LTI launch handler
//    Fires after LTIJS validates the token from Moodle.
//    Redirect straight into the textbook's table of contents.
// ---------------------------------------------------------------------------
lti.onConnect((token, req, res) => {
  // You can read the LTI context here if needed:
  //   token.userInfo.name  — learner display name
  //   token.roles          — e.g. ["Learner"] or ["Instructor"]
  //   token.platformContext.context.title — course name
  return res.redirect("/book/");
});

// ---------------------------------------------------------------------------
// 5. Start
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT, 10) || 3000;

lti.deploy({ port: PORT }).then(() => {
  console.log(`LTI tool listening on port ${PORT}`);
  console.log(`Book served at  http://localhost:${PORT}/book/`);
  console.log(`JWKS endpoint   http://localhost:${PORT}/keys`);
});
