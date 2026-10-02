require("dotenv").config();
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const { SignJWT, jwtVerify, createRemoteJWKSet } = require("jose");

const isProd = process.env.NODE_ENV === "production";

// ---------------------------------------------------------------------------
// 1. Config
//    MOODLE_URL     — e.g. https://moodle.example.com (no trailing slash)
//    CLIENT_ID      — Client ID Moodle shows after creating the External Tool
//    DEPLOYMENT_ID  — optional; if set, launches must carry this deployment
//    TOOL_URL       — public base URL of this app (e.g. the Cloud Run URL)
//    SESSION_SECRET — random string, min 32 chars, signs the cookies
// ---------------------------------------------------------------------------
const MOODLE_URL = (process.env.MOODLE_URL ?? "").replace(/\/$/, "");
const CLIENT_ID = process.env.CLIENT_ID;
const DEPLOYMENT_ID = process.env.DEPLOYMENT_ID;
const TOOL_URL = (process.env.TOOL_URL ?? "").replace(/\/$/, "");
const SESSION_SECRET = process.env.SESSION_SECRET;

if (isProd) {
  const missing = ["MOODLE_URL", "CLIENT_ID", "TOOL_URL", "SESSION_SECRET"].filter(
    (k) => !process.env[k]
  );
  if (missing.length) {
    console.error(`Missing required env vars: ${missing.join(", ")}`);
    process.exit(1);
  }
  if (SESSION_SECRET.length < 32) {
    console.error("SESSION_SECRET must be at least 32 characters.");
    process.exit(1);
  }
}

const secret = new TextEncoder().encode(SESSION_SECRET ?? "dev-only-secret");
const moodleKeys = MOODLE_URL
  ? createRemoteJWKSet(new URL(`${MOODLE_URL}/mod/lti/certs.php`))
  : null;

const LTI = "https://purl.imsglobal.org/spec/lti/claim/";
const SESSION_HOURS = 12;

// ---------------------------------------------------------------------------
// 2. Cookie helpers (signed JWTs — no database needed)
// ---------------------------------------------------------------------------
function sign(payload, expiresIn) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);
}

async function verify(token) {
  if (!token) return null;
  try {
    return (await jwtVerify(token, secret)).payload;
  } catch {
    return null;
  }
}

function getCookie(req, name) {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

// Production: Moodle POSTs the launch cross-site, so cookies need SameSite=None.
const cookieOpts = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? "none" : "lax",
  path: "/",
};

// ---------------------------------------------------------------------------
// 3. App
// ---------------------------------------------------------------------------
const app = express();
app.set("trust proxy", true);
app.use((req, res, next) => {
  res.set("X-Robots-Tag", "noindex, nofollow");
  next();
});

function deny(res, status = 401) {
  res
    .status(status)
    .type("html")
    .send(
      "<!doctype html><meta charset=utf-8><title>Access restricted</title>" +
        '<p style="font-family:sans-serif;margin:3rem auto;max-width:32rem">' +
        "Please open this textbook from your Moodle course.</p>"
    );
}

// ---------------------------------------------------------------------------
// 4. LTI 1.3 login initiation — Moodle calls this first.
//    We remember state + nonce in a short-lived cookie, then bounce back to
//    Moodle's auth endpoint.
// ---------------------------------------------------------------------------
app.all("/login", express.urlencoded({ extended: false }), async (req, res) => {
  const params = { ...req.query, ...req.body };

  if (params.iss !== MOODLE_URL) return deny(res, 400);
  if (params.client_id && params.client_id !== CLIENT_ID) return deny(res, 400);

  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();
  res.cookie("lti_state", await sign({ state, nonce }, "10m"), {
    ...cookieOpts,
    maxAge: 10 * 60 * 1000,
  });

  const auth = new URL(`${MOODLE_URL}/mod/lti/auth.php`);
  auth.search = new URLSearchParams({
    scope: "openid",
    response_type: "id_token",
    response_mode: "form_post",
    prompt: "none",
    client_id: CLIENT_ID,
    redirect_uri: `${TOOL_URL}/launch`,
    login_hint: params.login_hint ?? "",
    lti_message_hint: params.lti_message_hint ?? "",
    state,
    nonce,
  }).toString();

  res.redirect(auth.toString());
});

// ---------------------------------------------------------------------------
// 5. LTI 1.3 launch — Moodle POSTs a signed id_token here.
//    Verify it, then give the browser a session cookie for /book.
// ---------------------------------------------------------------------------
app.post("/launch", express.urlencoded({ extended: false }), async (req, res) => {
  const saved = await verify(getCookie(req, "lti_state"));
  if (!saved || saved.state !== req.body.state) return deny(res);

  let claims;
  try {
    ({ payload: claims } = await jwtVerify(req.body.id_token ?? "", moodleKeys, {
      issuer: MOODLE_URL,
      audience: CLIENT_ID,
    }));
  } catch (err) {
    console.warn("Launch rejected:", err.message);
    return deny(res);
  }

  if (
    claims.nonce !== saved.nonce ||
    claims[`${LTI}message_type`] !== "LtiResourceLinkRequest" ||
    (DEPLOYMENT_ID && claims[`${LTI}deployment_id`] !== DEPLOYMENT_ID)
  ) {
    return deny(res);
  }

  const session = await sign(
    { sub: claims.sub, name: claims.name ?? "" },
    `${SESSION_HOURS}h`
  );
  res.clearCookie("lti_state", cookieOpts);
  res.cookie("session", session, {
    ...cookieOpts,
    maxAge: SESSION_HOURS * 60 * 60 * 1000,
  });
  res.redirect(303, "/book/");
});

// ---------------------------------------------------------------------------
// 6. The textbook — only for browsers holding a valid session cookie.
//    In development the gate is skipped so you can edit content freely.
// ---------------------------------------------------------------------------
app.use(
  "/book",
  async (req, res, next) => {
    if (!isProd || (await verify(getCookie(req, "session")))) return next();
    deny(res);
  },
  express.static(path.join(__dirname, "_site"))
);

app.get("/", (req, res) => res.redirect("/book/"));

// ---------------------------------------------------------------------------
// 7. Start
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT, 10) || 3000;
app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}${isProd ? "" : " (dev: gate disabled)"}`);
  console.log(`Book served at http://localhost:${PORT}/book/`);
});
