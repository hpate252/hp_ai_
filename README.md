# hp_ai_
Cloud Flare Assignment

- Worker Live project URL: https://aipoweredapp.hpate252.workers.dev
- Uses Workers AI: @cf/meta/llama-3.3-70b-instruct-fp8-fast
- Stores per-session plans in a Durable Object (`HpSession`).
<img width="1198" height="701" alt="image" src="https://github.com/user-attachments/assets/8363a9ce-267c-42dd-9906-0c84de736513" />

# hp_ai_ - Habit Planner on Cloudflare Workers AI

hp_ai_ is a tiny focused web app that turns a messy todo list + a bit of context  
(time, energy, constraints) into a realistic short-term plan using **Cloudflare Workers AI**.

It runs entirely on Cloudflare:

- **Workers AI** (Llama 3.3) to generate the plan  
- A **Durable Object** (`HpSession`) to remember the last plan per browser session  
- A single **Worker** that serves both the HTML UI and the JSON API

---

## ✨ What it does

1. You paste your tasks on the left.
2. You add some context on the right (e.g. “I only have 10 minutes and low energy”).
3. The app calls Workers AI with a carefully designed prompt (see `PROMPTS.md`).
4. The model returns a short Markdown plan with four sections:

   - **Now (next 90 minutes)**
   - **Later today**
   - **This week**
   - **Delegate or drop**

5. The **Durable Object** stores the last plan for your browser session, so you can reload it with one click.

---

## 🏗️ Architecture

**Worker (`worker.js`)**

- Serves the UI at `/`
- Exposes two JSON endpoints:
  - `POST /api/plan` – generate a new plan
  - `GET  /api/last` – fetch the last saved plan for this session
- For API calls, it routes requests to the `HpSession` Durable Object using a **session ID** stored in `localStorage`.

**Durable Object (`HpSession`)**

- One instance per `sessionId` (per browser)
- Responsible for:
  - Calling Workers AI with the system + user prompts
  - Persisting the last plan in `state.storage` under the key `"last-plan"`
  - Returning the plan payload back to the Worker

**Workers AI**

- Model: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`
- Called via `env.AI.run(...)` with an OpenAI-style `messages` array
- Uses the system / user prompt pair defined in `createPlan(...)`  
  (full details in [`PROMPTS.md`](PROMPTS.md))

---

## 🧩 Tech Stack

- **Cloudflare Workers** (Module syntax)
- **Cloudflare Workers AI**
- **Cloudflare Durable Objects** (SQLite-backed)
- **Plain HTML, CSS, and vanilla JS** (no frameworks)
- **Wrangler** for local dev and deploy

---

## 📁 Project structure

```text
aipoweredapp/
  worker.js        # Worker + Durable Object + inline frontend
  wrangler.toml    # Cloudflare / Wrangler configuration
  PROMPTS.md       # Documentation of system + user prompts
  README.md        # This file
  package.json     # Dev dependencies (Wrangler etc.)

⚙️ Configuration (wrangler.toml)

name = "aipoweredapp"
main = "worker.js"
compatibility_date = "2025-12-21"

[ai]
binding = "AI"

[durable_objects]
bindings = [
  { name = "HP_SESSION", class_name = "HpSession" }
]

[[migrations]]
tag = "v1"
new_sqlite_classes = ["HpSession"]




🚀 Running locally

**You’ll need:

Node.js (LTS)

A Cloudflare account

npx (comes with Node)**

1. Install dependencies
**npm install**

2. Dev server (using real Cloudflare infrastructure)

Durable Objects + Workers AI work best with remote dev:

**npx wrangler dev --remote**


This will:

Build the Worker

**Run it on Cloudflare’s edge
**
Give you a local URL to open in the browser

🌍 Deploying to Cloudflare

Once everything looks good:

**npx wrangler deploy**


This:

Applies the migration to create the HpSession Durable Object class (if not already created)

Deploys the Worker code

Prints the live URL, e.g.:

https://aipoweredapp.<**your-account**>.workers.dev

🖥️ UI walk-through

When you open the app:

Session pill (top right)
Shows the first 8 characters of your session ID. Each browser gets its own Durable Object instance.

Tasks & todos
Free-form list, one per line. Example:

Finish resume draft
Clean up inbox
Study for networking midterm
30 min movement


Context
Anything about time, energy, constraints, or priorities. Example:

I have only 10 minutes, low energy, and an exam on Friday.


Buttons

⚡ Generate plan – calls POST /api/plan

⟳ Load last plan – calls GET /api/last and hydrates UI from Durable Object storage

AI Plan
The plan returned by the model is shown as plain text Markdown. It is also stored by HpSession so that a page reload doesn’t wipe it out.

📡 API endpoints

Although the frontend uses these, you can also call them manually (e.g. with curl or Postman).

POST /api/plan

Request body:

{
  "tasks": "Finish resume draft\nClean up inbox\n30 min movement",
  "context": "2 hours free tonight, exam on Friday, tired."
}

Response:

{
  "plan": "## Now (next 90 minutes)\n- ...",
  "createdAt": 1734890000000,
  "tasksText": "Finish resume draft\nClean up inbox\n30 min movement",
  "contextText": "2 hours free tonight, exam on Friday, tired."
}

GET /api/last

Returns the last saved plan for the current session:

{
  "plan": "...",
  "createdAt": 1734890000000,
  "tasksText": "…",
  "contextText": "…"
}
If no plan has been created yet, it returns an empty default object.

🧠 Prompt design
The exact system prompt and user template are documented in PROMPTS.md.

At a high level:
The system prompt makes the model act like a concise habit coach and enforces the 4-section Markdown structure.
The user message wraps the raw text as:

# Tasks
{tasks}

# Context
{context}

Build a realistic plan.
