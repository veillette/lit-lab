# Lit Lab — LTI 1.3 Interactive Textbook

An open textbook that launches from **Moodle** via LTI 1.3, built with
**Eleventy (11ty)** for content authoring and **LTIJS** for the LTI handshake and
grade passback.

## Stack

| Layer | Technology |
|---|---|
| Content authoring | Eleventy (11ty) — Markdown + Nunjucks |
| LTI 1.3 | [LTIJS](https://cvmcosta.me/ltijs/) |
| Database | MongoDB Atlas (free M0 tier) |
| Hosting | Google Cloud Run (free tier) |
| CI/CD | GitHub Actions |

## Project layout

```
lit-lab/
├── src/                    ← Eleventy source (Markdown chapters, templates)
│   ├── _includes/          ← Nunjucks layouts
│   ├── _data/              ← site.json, quiz.json
│   ├── chapters/           ← One .md file per chapter
│   ├── index.njk           ← Table of contents
│   └── quiz.njk            ← Quiz page
├── public/                 ← Static assets copied as-is
│   ├── css/style.css
│   └── js/quiz.js
├── server/
│   └── routes/grade.js     ← Grade passback API (/api/grade)
├── scripts/
│   └── register-platform.js ← One-time Moodle registration
├── server.js               ← LTIJS setup + Express routes
├── eleventy.config.js
├── Dockerfile
└── .github/workflows/deploy.yml
```

## Local development

### Prerequisites
- Node.js >= 18
- A running MongoDB instance (or a free Atlas M0 cluster)

```bash
# 1. Install dependencies
npm install

# 2. Copy and fill in the env file
cp .env.example .env
# edit .env — set LTI_KEY and MONGODB_URL at minimum

# 3. Build + watch Eleventy, start the server with auto-reload
npm run dev
```

The server runs at http://localhost:3000.
The textbook (after an LTI launch) is at http://localhost:3000/book/.

Dev mode note: In development LTIJS uses devMode: true, which skips HTTPS
and relaxes cookie requirements. To test a full LTI flow locally use
ngrok to expose your local port over HTTPS.

## Moodle setup (one time per instance)

### 1. Create an External Tool in Moodle

Site Administration > Plugins > Activity modules > External tool >
Manage tools > Configure a tool manually:

| Field | Value |
|---|---|
| Tool URL | https://YOUR_CLOUD_RUN_URL/ |
| LTI version | LTI 1.3 |
| Public key type | Keyset URL |
| Public keyset URL | https://YOUR_CLOUD_RUN_URL/keys |
| Initiate login URL | https://YOUR_CLOUD_RUN_URL/login |
| Redirection URI | https://YOUR_CLOUD_RUN_URL/ |
| Supports Deep Linking | No |
| Grading | Enabled (required for grade passback) |

Save — Moodle displays a Client ID. Copy it.

### 2. Register Moodle with LTIJS

```bash
MOODLE_URL=https://moodle.example.com \
MOODLE_CLIENT_ID=paste_client_id_here \
npm run register-platform
```

Run this once. The registration persists in MongoDB across restarts.

## Deployment (Google Cloud Run)

### Required GitHub Secrets

| Secret | Description |
|---|---|
| GCP_PROJECT_ID | Your GCP project ID |
| GCP_REGION | Cloud Run region, e.g. us-central1 |
| GCP_SERVICE_NAME | Cloud Run service name, e.g. lit-lab |
| GCP_WORKLOAD_IDENTITY_PROVIDER | WIF provider resource name |
| GCP_SERVICE_ACCOUNT | Service account email for deployments |

### Required GCP Secret Manager secrets

Store LTI_KEY and MONGODB_URL in GCP Secret Manager.
The deploy workflow injects them via --set-secrets.

Push to main — GitHub Actions builds the Docker image, pushes to GCR,
and redeploys Cloud Run automatically.

## Adding content

Create src/chapters/03-new-topic.md with frontmatter:

```markdown
---
layout: chapter.njk
title: New Topic
summary: One-line description for the TOC.
---

Your Markdown content here.
```

Push to main — CI/CD rebuilds and redeploys.

## Editing the quiz

Edit src/_data/quiz.json. Each question needs:
- id — unique string
- text — the question
- options — array of answer strings
- correct — zero-based index of the correct answer

Scores post to Moodle automatically on quiz submission via LTI AGS.
