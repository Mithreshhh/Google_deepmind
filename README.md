# CodePulse AI

**AI that reacts while you code.**

Hackathon track: **Problem Statement 1, Frontier Intelligence at Flash Speed** (Gemini 3.8 Flash, `gemini-3.8-flash`).

## What it does

CodePulse is a live coding workspace with no Analyze button and no chat box. You type in the editor, and when you pause for 800ms Gemini analyzes the code on its own. Three specialist analyzers run in parallel, a verifier cross-checks their findings and reasons through test scenarios, and each finding has an **Apply AI Fix** button. Applying a fix rewrites the code in the editor, which triggers a fresh analysis so you can see the issue disappear and the score move.

## Architecture

```
Developer types
  → Live change detector (800ms debounce, stale requests cancelled)
  → Parallel Gemini analyzers (Promise.all, 3 separate calls)
  → Verification engine (4th call, reviews the other three)
  → Live intelligence panel (results stream in per analyzer)
  → AI fix (/api/fix returns full corrected source)
  → Automatic re-analysis
```

The three parallel engines are separate Gemini calls, each with its own focused prompt and JSON output:

| Engine | Looks for |
|---|---|
| **Bug Analyzer** | logic errors, runtime crashes, null/undefined access, edge cases, error handling |
| **Security Analyzer** | SQL/command injection, XSS, hard-coded secrets, unsafe eval, auth and input trust issues |
| **Quality Analyzer** | readability, complexity, duplication, naming, performance, maintainability |

The **verifier** receives the code and all findings, rejects false positives (shown as "dismissed" in the UI), produces 3 to 6 reasoned verification checks and a 0 to 100 score. The checks are model reasoning and are labeled as such. Nothing is executed.

### The loop: Sense → Decide → Act → Check

- **Sense:** every edit is detected. In-flight analysis for older code is aborted.
- **Decide:** three analyzers run concurrently, then the verifier filters and scores.
- **Act:** Apply AI Fix sends the issue to Gemini and replaces the editor contents (Ctrl+Z undoes it).
- **Check:** the new code is re-analyzed automatically. The timeline reports what was resolved and how the score changed.

`POST /api/analyze` streams NDJSON stage events (`analyzer_done`, `verify_start`, `verify_done`, `result`) so the UI shows each analyzer finishing in real time. Without `stream: true` it returns one combined JSON object. All timings shown in the UI are measured, not simulated.

## Setup

Requires Node 18+.

```bash
npm install          # installs root, server and client
# put your key in .env (copy .env.example if .env is missing)
#   GEMINI_API_KEY=...
npm run dev          # backend on :5000, frontend on :5173
```

Open http://localhost:5173.

| Script | What it does |
|---|---|
| `npm run install-all` | install server and client dependencies |
| `npm run dev` | run backend and frontend together |
| `npm run build` then `npm start` | serve the built app from the backend on :5000 |

### Environment

| Variable | Default | Notes |
|---|---|---|
| `GEMINI_API_KEY` | required | stays on the backend, never sent to the browser |
| `PORT` | `5000` | backend port (the Vite proxy follows it) |
| `GEMINI_MODEL` | `gemini-3.8-flash` | override if needed |
| `GEMINI_THINKING_LEVEL` | `low` | `low` (fastest level gemini-3.8-flash supports), `medium`, `high`, or `off` |
| `VITE_API_URL` | empty | frontend only: backend origin when hosted separately |
| `CORS_ORIGIN` | any origin | backend only: comma-separated list of allowed frontend origins |
| `VITE_DEMO_MODE` | off | `true` enables a local fallback when Gemini is unreachable. The UI shows a DEMO MODE badge whenever fallback data is on screen. |

After editing `.env`, restart `npm run dev`.

## Deploy (Render backend + Vercel frontend)

**Render** (New → Web Service → this repo)
- Root Directory: `server`
- Build Command: `npm install`
- Start Command: `npm start`
- Environment: `GEMINI_API_KEY`, and `CORS_ORIGIN=https://<your-app>.vercel.app` once you know the Vercel URL
- Health check path: `/api/health`

**Vercel** (Add New → Project → this repo)
- Root Directory: `client` (framework preset: Vite)
- Environment: `VITE_API_URL=https://<your-service>.onrender.com`
- Redeploy after changing `VITE_API_URL`, since it is baked in at build time.

Render's free tier sleeps after 15 minutes idle and takes about a minute to wake. Open `https://<your-service>.onrender.com/api/health` before a demo.

## Project layout

```
server/  server.js (Express routes, streaming), gemini.js (SDK calls, prompts, JSON parsing)
client/  React + Vite + Monaco; components/ holds the editor, panels and timeline
```
