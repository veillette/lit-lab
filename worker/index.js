import { SignJWT, jwtVerify, createRemoteJWKSet } from "jose";

// ---------------------------------------------------------------------------
// Cloudflare Worker: LTI 1.3 gate in front of the static textbook.
//
// Config (wrangler.jsonc "vars" + `wrangler secret put SESSION_SECRET`):
//   MOODLE_URL     — e.g. https://moodle.example.com (no trailing slash)
//   CLIENT_ID      — Client ID Moodle shows after creating the External Tool
//   DEPLOYMENT_ID  — optional; if set, launches must carry this deployment
//   SESSION_SECRET — random string, min 32 chars, signs the cookies
//
// The built site (_site/book) is served by the ASSETS binding, but only to
// browsers holding a valid session cookie. No database: all state lives in
// signed cookies.
// ---------------------------------------------------------------------------

const LTI = "https://purl.imsglobal.org/spec/lti/claim/";
const SESSION_HOURS = 12;

let jwks; // cached Moodle key set, reused across requests
function moodleKeys(env) {
  jwks ??= createRemoteJWKSet(new URL(`${moodleUrl(env)}/mod/lti/certs.php`));
  return jwks;
}

const moodleUrl = (env) => (env.MOODLE_URL ?? "").replace(/\/$/, "");
const secret = (env) => new TextEncoder().encode(env.SESSION_SECRET);

// ---- Signed-cookie helpers ------------------------------------------------
function sign(env, payload, expiresIn) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret(env));
}

async function verify(env, token) {
  if (!token) return null;
  try {
    return (await jwtVerify(token, secret(env))).payload;
  } catch {
    return null;
  }
}

function getCookie(request, name) {
  for (const part of (request.headers.get("Cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

// Moodle POSTs the launch cross-site, so cookies need SameSite=None; Secure.
function cookie(name, value, maxAgeSeconds) {
  return `${name}=${value}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; Secure; SameSite=None`;
}

// ---- Responses ------------------------------------------------------------
function deny(reason, status = 401) {
  console.warn(`Denied (${status}): ${reason}`);
  return new Response(
    "<!doctype html><meta charset=utf-8><title>Access restricted</title>" +
      '<p style="font-family:sans-serif;margin:3rem auto;max-width:32rem">' +
      "Please open this textbook from your Moodle course.</p>",
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

function redirect(location, status = 302, cookies = []) {
  const headers = new Headers({ Location: location });
  for (const c of cookies) headers.append("Set-Cookie", c);
  return new Response(null, { status, headers });
}

async function formParams(request) {
  if (request.method !== "POST") return {};
  return Object.fromEntries(await request.formData());
}

// ---- LTI 1.3 login initiation — Moodle calls this first ---------------------
// Remember state + nonce in a short-lived cookie, then bounce back to Moodle.
async function login(request, env) {
  const url = new URL(request.url);
  const params = { ...Object.fromEntries(url.searchParams), ...(await formParams(request)) };

  if (params.iss !== moodleUrl(env)) return deny(`login: unexpected iss "${params.iss}"`, 400);
  if (params.client_id && params.client_id !== env.CLIENT_ID) {
    return deny(`login: unexpected client_id "${params.client_id}"`, 400);
  }

  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();

  const auth = new URL(`${moodleUrl(env)}/mod/lti/auth.php`);
  auth.search = new URLSearchParams({
    scope: "openid",
    response_type: "id_token",
    response_mode: "form_post",
    prompt: "none",
    client_id: env.CLIENT_ID,
    redirect_uri: `${url.origin}/launch`,
    login_hint: params.login_hint ?? "",
    lti_message_hint: params.lti_message_hint ?? "",
    state,
    nonce,
  }).toString();

  return redirect(auth.toString(), 302, [
    cookie("lti_state", await sign(env, { state, nonce }, "10m"), 600),
  ]);
}

// ---- LTI 1.3 launch — Moodle POSTs a signed id_token here -----------------
// Verify it, then give the browser a session cookie for /book.
async function launch(request, env) {
  const form = await formParams(request);
  const saved = await verify(env, getCookie(request, "lti_state"));
  if (!saved) return deny("launch: missing or expired lti_state cookie");
  if (saved.state !== form.state) return deny("launch: state mismatch");

  let claims;
  try {
    ({ payload: claims } = await jwtVerify(form.id_token ?? "", moodleKeys(env), {
      issuer: moodleUrl(env),
      audience: env.CLIENT_ID,
    }));
  } catch (err) {
    return deny(`launch: id_token invalid (${err.message})`);
  }

  if (claims.nonce !== saved.nonce) return deny("launch: nonce mismatch");
  if (claims[`${LTI}message_type`] !== "LtiResourceLinkRequest") {
    return deny(`launch: unexpected message_type "${claims[`${LTI}message_type`]}"`);
  }
  if (env.DEPLOYMENT_ID && claims[`${LTI}deployment_id`] !== env.DEPLOYMENT_ID) {
    return deny(`launch: unexpected deployment_id "${claims[`${LTI}deployment_id`]}"`);
  }

  const session = await sign(env, { sub: claims.sub, name: claims.name ?? "" }, `${SESSION_HOURS}h`);
  return redirect("/book/", 303, [
    cookie("lti_state", "", 0),
    cookie("session", session, SESSION_HOURS * 3600),
  ]);
}

// ---- Router -----------------------------------------------------------------
async function route(request, env) {
  const { pathname } = new URL(request.url);

  if (pathname === "/login") return login(request, env);
  if (pathname === "/launch" && request.method === "POST") return launch(request, env);
  if (pathname === "/") return redirect("/book/");

  if (pathname === "/book" || pathname.startsWith("/book/")) {
    if (!(await verify(env, getCookie(request, "session")))) {
      return deny(`book: no valid session cookie (${pathname})`);
    }
    return env.ASSETS.fetch(request);
  }

  return new Response("Not found", { status: 404 });
}

export default {
  async fetch(request, env) {
    if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
      return new Response("SESSION_SECRET is not configured.", { status: 500 });
    }
    const res = await route(request, env);
    const out = new Response(res.body, res);
    out.headers.set("X-Robots-Tag", "noindex, nofollow");
    return out;
  },
};
