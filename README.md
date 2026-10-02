# Lit Lab — Private Textbook for a Moodle Course

A textbook written in Markdown with **Eleventy (11ty)**, hosted on
**Cloudflare Workers** (free tier) behind a small gate that only lets in students
who launch it from **Moodle** (LTI 1.3). No database, no quizzes, no grades.

## How access works

1. A student clicks the textbook activity in the Moodle course.
2. Moodle performs an LTI 1.3 launch: `/login` → Moodle → `POST /launch` with a signed token.
3. The worker verifies the token against Moodle's public keys and sets a
   signed session cookie (valid 12 h).
4. Everything under `/book/` requires that cookie. Anyone else sees
   "Please open this textbook from your Moodle course."

Only people who can see the activity in Moodle can launch it, so access is
controlled by course enrolment in Moodle.

## Project layout

```
lit-lab/
├── src/                 ← Eleventy source
│   ├── _includes/       ← Nunjucks layouts
│   ├── _data/site.json  ← title, description, author
│   ├── chapters/        ← one .md file per chapter
│   └── index.njk        ← table of contents
├── public/css/          ← static assets (copied into the build)
├── worker/index.js      ← LTI gate (Cloudflare Worker)
├── wrangler.jsonc       ← Worker config + Moodle settings
└── eleventy.config.js   ← builds into _site/book/
```

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:8080/book/. This is plain Eleventy with live reload —
no gate, so you can edit content without Moodle.

To run the real Worker (with the gate) locally, create a `.dev.vars` file
containing `SESSION_SECRET=<32+ random chars>` and run `npm run preview`.

## Adding content

Create `src/chapters/03-new-topic.md`:

```markdown
---
layout: chapter.njk
title: New Topic
summary: One-line description for the table of contents.
---

Your Markdown content here.
```

Chapters are ordered by filename. Push to `main` to redeploy.

## Moodle setup (one time)

`TOOL_URL` below is your Worker's address, e.g.
`https://lit-lab.<your-subdomain>.workers.dev`.

In the course (or Site administration → Plugins → Activity modules →
External tool → Manage tools), configure a tool manually:

| Field | Value |
|---|---|
| Tool URL | `https://TOOL_URL/launch` |
| LTI version | LTI 1.3 |
| Public key type | Not used — leave blank, or paste any RSA public key if Moodle insists |
| Initiate login URL | `https://TOOL_URL/login` |
| Redirection URI(s) | `https://TOOL_URL/launch` |
| Default launch container | **New window** (browsers block cookies inside Moodle's iframe) |
| Services / grades / deep linking | Off |

After saving, Moodle shows a **Client ID** and **Deployment ID**. Put them,
with your Moodle address, in the `vars` section of `wrangler.jsonc`:

| Variable | Description |
|---|---|
| `MOODLE_URL` | e.g. `https://moodle.example.com` |
| `CLIENT_ID` | Client ID from the Moodle tool |
| `DEPLOYMENT_ID` | Deployment ID from the Moodle tool (optional, recommended) |

Then add the tool as an activity in your course.

## Deployment (Cloudflare Workers)

One-time setup:

1. Create a free Cloudflare account.
2. Deploy once from your machine and set the cookie-signing secret
   (stored encrypted by Cloudflare, never in git):
   ```bash
   npx wrangler login
   npm run deploy                           # prints your workers.dev URL
   npx wrangler secret put SESSION_SECRET   # paste: openssl rand -hex 32
   ```
3. In the Cloudflare dashboard → Workers & Pages → **lit-lab** → Settings →
   Builds, connect the GitHub repo `veillette/lit-lab`:
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`

After that, every push to `main` rebuilds and redeploys automatically.
You can also deploy by hand at any time with `npm run deploy`.
