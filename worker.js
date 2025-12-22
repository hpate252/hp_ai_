// hp_ai_ - Habit Planner AI on Cloudflare Workers

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

// Durable Object: one instance per browser/session ID
export class HpSession {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.endsWith("/plan") && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return new Response(
          JSON.stringify({ error: "Invalid JSON body" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      const tasks = (body.tasks ?? "").toString();
      const context = (body.context ?? "").toString();

      try {
        const result = await this.createPlan(tasks, context);
        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (err) {
        console.error("Error creating plan", err);
        return new Response(
          JSON.stringify({ error: "AI planning failed" }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    if (url.pathname.endsWith("/last") && request.method === "GET") {
      const last = await this.state.storage.get("last-plan");

      return new Response(
        JSON.stringify(
          last || {
            plan: "",
            createdAt: null,
            tasksText: "",
            contextText: "",
          },
        ),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response("Not found in HpSession", { status: 404 });
  }

  async createPlan(tasksText, contextText) {
    const now = Date.now();

    const messages = [
      {
        role: "system",
        content:
          "You are HP, a concise habit and focus coach. " +
          "Given unstructured tasks and context (time, energy, priorities), " +
          "you create a short, practical plan.\n\n" +
          "Structure the answer in Markdown with these headings: " +
          "'Now (next 90 minutes)', 'Later today', 'This week', 'Delegate or drop'.\n" +
          "Use bullet points, be concrete, and keep total length under 250 words.",
      },
      {
        role: "user",
        content:
          `# Tasks\n${tasksText || "(no tasks specified)"}\n\n` +
          `# Context\n${contextText || "(no extra context)"}\n\n` +
          "Build a realistic plan.",
      },
    ];

    let aiResult;
    try {
      aiResult = await this.env.AI.run(MODEL, {
        messages,
        max_tokens: 400,
      });
    } catch (err) {
      console.error("Workers AI error", err);
      throw err;
    }

    const reply =
      typeof aiResult === "string"
        ? aiResult
        : typeof aiResult.response === "string"
        ? aiResult.response
        : JSON.stringify(aiResult);

    const record = {
      plan: reply,
      createdAt: now,
      tasksText,
      contextText,
    };

    // Persist last plan for this session
    await this.state.storage.put("last-plan", record);

    return record;
  }
}

// Small HTML + JS UI, all inline
function renderHtmlPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>hp_ai_ — Habit Planner on Cloudflare Workers AI</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root {
        color-scheme: dark;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        justify-content: center;
        align-items: stretch;
        background: radial-gradient(circle at top, #222 0, #050505 55%);
        color: #f5f5f5;
      }
      main {
        width: 100%;
        max-width: 960px;
        padding: 24px 16px 32px;
      }
      .card {
        background: rgba(15, 15, 20, 0.95);
        border-radius: 18px;
        border: 1px solid rgba(255, 255, 255, 0.06);
        box-shadow: 0 18px 40px rgba(0, 0, 0, 0.65);
        padding: 20px 20px 18px;
        backdrop-filter: blur(18px);
      }
      header {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
        margin-bottom: 12px;
      }
      h1 {
        font-size: 1.4rem;
        letter-spacing: 0.03em;
        margin: 0;
      }
      h1 span {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 999px;
        background: linear-gradient(135deg, #ff8a3c, #ff4e88);
        font-size: 0.76rem;
        text-transform: uppercase;
        letter-spacing: 0.18em;
        margin-left: 8px;
      }
      .tagline {
        font-size: 0.86rem;
        opacity: 0.78;
        margin-top: 2px;
      }
      form {
        display: grid;
        grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
        gap: 14px;
        margin-top: 10px;
      }
      label {
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.18em;
        opacity: 0.8;
        display: block;
        margin-bottom: 4px;
      }
      textarea {
        width: 100%;
        min-height: 130px;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(6, 6, 10, 0.9);
        padding: 10px 11px;
        resize: vertical;
        color: inherit;
        font: 0.9rem/1.4 system-ui, sans-serif;
      }
      textarea:focus-visible {
        outline: 1px solid #ff8a3c;
        border-color: #ffb14a;
        box-shadow: 0 0 0 1px rgba(255, 138, 60, 0.5);
      }
      .right-col {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      #output {
        min-height: 220px;
        white-space: pre-wrap;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      }
      .controls {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-top: 8px;
        flex-wrap: wrap;
      }
      button {
        border-radius: 999px;
        border: none;
        padding: 8px 16px;
        font-size: 0.9rem;
        font-weight: 500;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: linear-gradient(135deg, #ff8a3c, #ff4e88);
        color: #111;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.6);
      }
      button span.icon {
        font-size: 1.1rem;
      }
      button:disabled {
        opacity: 0.5;
        cursor: progress;
        box-shadow: none;
      }
      .status {
        font-size: 0.78rem;
        opacity: 0.8;
      }
      .pill {
        padding: 3px 8px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.16);
        font-size: 0.72rem;
        text-transform: uppercase;
        letter-spacing: 0.15em;
      }
      @media (max-width: 768px) {
        form {
          grid-template-columns: minmax(0, 1fr);
        }
      }
    </style>
  </head>
  <body>
    <main>
      <div class="card">
        <header>
          <div>
            <h1>hp_ai_ Habit Planner <span>Workers AI</span></h1>
            <div class="tagline">
              Paste your tasks, add a bit of context, and let Llama&nbsp;3.3 turn it
              into a focused plan with per-browser memory.
            </div>
          </div>
          <div class="pill" id="session-pill">Session: …</div>
        </header>

        <form id="planner-form">
          <div>
            <label for="tasks">Tasks &amp; todos</label>
            <textarea id="tasks" name="tasks" placeholder="- Finish resume draft
- Clean up inbox
- Study for networking midterm
- 30 min movement"></textarea>
          </div>
          <div class="right-col">
            <div>
              <label for="context">Context (time, energy, constraints)</label>
              <textarea id="context" name="context" placeholder="e.g. 2 hours free tonight, pretty tired, exam on Friday, want to prioritise deep work over chores."></textarea>
            </div>
            <div>
              <label for="output">AI plan</label>
              <textarea id="output" readonly placeholder="Your personalised plan will appear here…"></textarea>
            </div>
          </div>
        </form>

        <div class="controls">
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <button id="submit-btn" type="button">
              <span class="icon">⚡</span>
              Generate plan
            </button>
            <button id="reload-btn" type="button" style="background:rgba(20,20,26,0.98); color:#eee; box-shadow:none; border:1px solid rgba(255,255,255,0.16);">
              ⟳ Load last plan
            </button>
          </div>
          <div class="status" id="status">
            Idle. Your session lives in a Durable Object keyed to this browser.
          </div>
        </div>
      </div>
    </main>

    <script type="module">
      const tasksEl = document.getElementById("tasks");
      const contextEl = document.getElementById("context");
      const outputEl = document.getElementById("output");
      const statusEl = document.getElementById("status");
      const submitBtn = document.getElementById("submit-btn");
      const reloadBtn = document.getElementById("reload-btn");
      const sessionPill = document.getElementById("session-pill");

      function makeSessionId() {
        if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
        return "sess-" + Date.now().toString(36) + "-" + Math.random().toString(16).slice(2);
      }

      let sessionId = window.localStorage.getItem("hp_ai_session_id");
      if (!sessionId) {
        sessionId = makeSessionId();
        window.localStorage.setItem("hp_ai_session_id", sessionId);
      }
      sessionPill.textContent = "Session: " + sessionId.slice(0, 8) + "…";

      async function callApi(path, options) {
        const url = path + "?session=" + encodeURIComponent(sessionId);
        const res = await fetch(url, options);
        if (!res.ok) {
          const text = await res.text();
          throw new Error("Request failed: " + res.status + " " + text);
        }
        return res.json();
      }

      async function generatePlan() {
        const tasks = tasksEl.value.trim();
        const context = contextEl.value.trim();

        submitBtn.disabled = true;
        statusEl.textContent = "Planning with Llama 3.3…";

        try {
          const data = await callApi("/api/plan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tasks, context }),
          });

          outputEl.value = data.plan || "(no response)";
          if (!tasks && data.tasksText) tasksEl.value = data.tasksText;
          if (!context && data.contextText) contextEl.value = data.contextText;

          const when = data.createdAt ? new Date(data.createdAt) : new Date();
          statusEl.textContent = "Plan updated at " + when.toLocaleTimeString();
        } catch (err) {
          console.error(err);
          statusEl.textContent = "Error: " + err.message;
        } finally {
          submitBtn.disabled = false;
        }
      }

      async function loadLastPlan() {
        statusEl.textContent = "Loading previous plan…";
        reloadBtn.disabled = true;

        try {
          const data = await callApi("/api/last", { method: "GET" });
          if (data.plan) {
            outputEl.value = data.plan;
            tasksEl.value = data.tasksText || "";
            contextEl.value = data.contextText || "";
            const when = data.createdAt ? new Date(data.createdAt) : null;
            statusEl.textContent = when
              ? "Loaded last plan from " + when.toLocaleString()
              : "Loaded last plan.";
          } else {
            statusEl.textContent =
              "No saved plan yet. Paste tasks and hit Generate.";
          }
        } catch (err) {
          console.error(err);
          statusEl.textContent = "Couldn't load previous plan: " + err.message;
        } finally {
          reloadBtn.disabled = false;
        }
      }

      submitBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        generatePlan();
      });

      reloadBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        loadLastPlan();
      });

      // Try to hydrate with last plan on load
      loadLastPlan();
    </script>
  </body>
</html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // UI
    if (url.pathname === "/") {
      return new Response(renderHtmlPage(), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // API -> route into Durable Object
    if (url.pathname === "/api/plan" || url.pathname === "/api/last") {
      const sessionId = url.searchParams.get("session") || "anonymous";

      if (!env.HP_SESSION) {
        return new Response(
          JSON.stringify({
            error:
              "Durable Object binding HP_SESSION is not configured. Check wrangler.toml.",
          }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }

      const id = env.HP_SESSION.idFromName(sessionId);
      const stub = env.HP_SESSION.get(id);

      const internalPath =
        url.pathname === "/api/plan" ? "/session/plan" : "/session/last";

      const init = {
        method: request.method,
        headers: request.headers,
      };

      if (request.method === "POST" && url.pathname === "/api/plan") {
        init.body = await request.text();
      }

      const doRequest = new Request(
        new URL(internalPath, "https://hp_session.internal"),
        init,
      );

      return stub.fetch(doRequest);
    }

    return new Response("Not found", { status: 404 });
  },
};