# Lit Lab — Private Textbook for a Moodle Course

A textbook written in Markdown with **Eleventy (11ty)**, served by a tiny Express
server that only lets in students who launch it from **Moodle** (LTI 1.3).
No database, no quizzes, no grades.

## How access works

1. A student clicks the textbook activity in the Moodle course.
2. Moodle performs an LTI 1.3 launch: `/login` → Moodle → `POST /launch` with a signed token.
3. The server verifies the token against Moodle's public keys and sets a
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
├── public/css/          ← static assets (copied to _site/)
├── server.js            ← LTI gate + static file server
├── eleventy.config.js
├── Dockerfile
└── .github/workflows/deploy.yml
```

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:3000/book/. In development (`NODE_ENV` ≠ `production`)
the access gate is **disabled**, so you can edit content without Moodle.

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

After saving, Moodle shows a **Client ID** and **Deployment ID** — put them in
the configuration below. Then add the tool as an activity in your course.

## Configuration

| Variable | Description |
|---|---|
| `MOODLE_URL` | e.g. `https://moodle.example.com` |
| `CLIENT_ID` | Client ID from the Moodle tool |
| `DEPLOYMENT_ID` | Deployment ID from the Moodle tool (optional, recommended) |
| `TOOL_URL` | Public URL of this app, e.g. the Cloud Run URL |
| `SESSION_SECRET` | Random string ≥ 32 chars (`openssl rand -hex 32`) |

## Deployment (Google Cloud Run)

Push to `main`; GitHub Actions builds the Docker image and deploys it.

- **GitHub secrets:** `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_SERVICE_NAME`,
  `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`
- **GitHub variables:** `MOODLE_URL`, `CLIENT_ID`, `DEPLOYMENT_ID`, `TOOL_URL`
- **GCP Secret Manager:** `SESSION_SECRET`
