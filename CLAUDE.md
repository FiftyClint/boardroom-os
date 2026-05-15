# CLAUDE.md

Guidance for AI assistants (Claude Code, etc.) working in this repository.

## What this is

Boardroom OS is a full-stack Node.js web app that runs synthetic "AI board meetings." The user describes a matter before the board, and seven hard-coded board-member personas (Munger, Hormozi, Utility Insider, Data Center Operator, Energy Finance Dealmaker, Federal Policy Veteran, Corporate Lawyer) deliberate in sequence via streamed Anthropic Claude responses. Sessions, messages, documents, and per-user context persist in Supabase Postgres.

Domain focus is rural electric cooperative + data center / HPC infrastructure deal-making across SPP / ERCOT — the personas, `user_context`, and uploaded documents bake that lens into every prompt.

## Stack at a glance

- **Runtime:** Node `>=20`, single Express server (`server/index.js`) that also serves static client files from `client/`. No bundler, no framework on the client — vanilla ES modules.
- **AI:** `@anthropic-ai/sdk` streaming. Model string is hard-coded as `claude-sonnet-4-20250514` in `server/lib/anthropic.js`. Each board member call is `max_tokens: 1000`, system prompt = persona + user context + attached documents, single user-turn message containing topic + history + current-round transcript.
- **Persistence:** Supabase. Server uses the **service role key** (`supabaseAdmin`) for all DB writes/reads to bypass RLS — the security boundary is Express session auth, not Postgres RLS. The anon client is used only for Supabase Auth (signup/signin/password reset).
- **Sessions:** `express-session` (in-memory store). Cookie is `secure` only when `NODE_ENV=production`.
- **Streaming protocol:** Server-Sent Events from `/api/board/session/:sessionId/round[/respond]`. Frontend reads with `fetch` + `ReadableStream`, splits on `\n\n`.
- **File parsing:** `multer` memory storage → `mammoth` (docx), `pdf-parse` (pdf), raw utf-8 for txt/md. Content truncated to 40,000 chars.
- **Deploy:** Railway (`railway.json` → NIXPACKS, `Procfile` → `node server/index.js`, healthcheck `/api/health`).

## Layout

```
server/
  index.js                # Express bootstrap, middleware, route mounting, SPA fallback
  lib/
    members.js            # The seven board personas (full system prompts) + getMemberById
    anthropic.js          # streamMemberResponse(), parseQuestion() — model is set here
    context-manager.js    # buildPromptForMember() — assembles system + messages payload
    parsers.js            # currently empty stub (module.exports = {})
  routes/
    auth.js               # Supabase Auth wrappers + requireAuth middleware (also exported)
    sessions.js           # CRUD on sessions, search, attach/detach documents
    board.js              # The round engine + SSE stream (runBoardStream)
    documents.js          # File upload, listing, deletion
    context.js            # GET/PUT per-user "user_context" string
client/
  index.html              # All views (auth, forgot/reset password, onboarding, app) in one file
  style.css               # Dark Cormorant + DM Sans theme
  app.js                  # Top-level state, navigation, submitRound() SSE consumer
  components/
    auth.js               # Login/register/forgot/reset wiring
    sidebar.js            # Session list, "Convene Board" button
    roster.js             # Member chips, setSpeakingMember()
    discussion.js         # Render messages, token append, question banner
    input-zone.js         # Textarea + submit, idle/streaming/paused states
    context-editor.js     # Onboarding context textarea + save
test-stream.js            # Manual smoke test for SSE (targets /api/board/stream — stale path)
Procfile, railway.json, .env.example, README.md
```

## Required environment

Copy `.env.example`:

```
ANTHROPIC_API_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SESSION_SECRET=
PORT=3000
NODE_ENV=development
```

All five secrets are required at runtime. The app does **not** crash without them — most routes will silently 401 / 500. If a request mysteriously fails, check env first.

## Running

```
npm install
npm run dev          # alias for `node server/index.js`
```

There is no build step, no test runner, no linter configured. `npm start` and `npm run dev` are identical.

## Supabase schema (inferred from queries — confirm before editing)

You must run schema SQL in the Supabase UI before the app works. The code references these tables/columns:

- `users` — `id` (uuid, matches Supabase Auth user id), `email`, `name`
- `sessions` — `id`, `user_id`, `topic`, `title`, `created_at`, `updated_at`
- `messages` — `id`, `session_id`, `role` (`'user' | 'board'`), `member_id` (nullable for user rows), `content`, `round` (int), `created_at`
- `documents` — `id`, `user_id`, `session_id` (nullable; null = unattached), `filename`, `content`, `created_at`
- `user_context` — `user_id` (unique / upsert key on `user_id`), `content`, `updated_at`

There is no migrations directory. If you change the schema, update this list and the README.

## How a "round" actually works

Read `server/routes/board.js` end-to-end before touching this — the orchestration is non-obvious.

1. Client POSTs to `/api/board/session/:id/round` (new round) or `/round/respond` (continuation after a pause).
2. Server verifies session ownership, opens SSE, loads `user_context`, attached `documents`, and **all** prior `messages` for the session.
3. Current round number = `max(messages.round)`, incremented by 1 only when starting a new round and prior messages exist.
4. User's text is inserted as a `messages` row with `role='user'` **before** any member speaks.
5. Speaking order = `MEMBERS` array order. On a new round, `directedMemberId` (if provided) jumps to the front. On a `/respond`, anyone who already spoke this round is filtered out.
6. For each remaining member, `buildPromptForMember()` produces `{ system, messages }`:
   - `system` = persona + `user_context.content` + `=== DOCUMENTS PROVIDED === ... === END DOCUMENTS ===`
   - `messages` = one user-role entry with `MATTER BEFORE THE BOARD`, `PRIOR SESSION HISTORY` (last 2000 words of prior rounds), `THIS ROUND'S DISCUSSION SO FAR`, optional `USER'S MOST RECENT INPUT` block (extracted from the most recent `User:` line in `priorInRound`), and a "Your turn" footer.
7. Stream tokens are forwarded as SSE `{type:'token', memberId, text}`. The full text is persisted to `messages` (including the `[QUESTION FOR USER: …]` marker if present), then `member_done` is emitted.
8. If `parseQuestion()` finds a `[QUESTION FOR USER: …]` block, the loop emits `pause_required` and **stops** — the rest of the round is run on the next `/round/respond` call.
9. When the loop finishes without a pause, `round_complete` is emitted.

The client consumer in `client/app.js → submitRound()` mirrors this state machine via `state.pauseData`.

## Persona system

- All seven personas live as inline template strings in `server/lib/members.js`. They're long (the file is ~430 lines, almost entirely prompt text) and carry detailed domain knowledge for SPP/ERCOT, RUS lending, co-op governance, federal programs, etc.
- Every persona ends with the instruction to emit `[QUESTION FOR USER: …]` only for genuine questions — `parseQuestion()` depends on that exact bracket format with a case-insensitive, dotall regex.
- Word cap is 140 per response (persona-enforced) but `max_tokens` is 1000 — leave headroom in mind when tightening prompts.
- Each member also has `color`, `initials`, `shortName` used by the client roster. CSS classes in `client/style.css` are keyed off `id` (`munger`, `hormozi`, `utility`, `datacenter`, `finance`, `policy`, `lawyer`) — if you add a member, you must add the matching CSS chip class.
- `/api/board/members` returns the safe (persona-less) view of `MEMBERS` for the client.

## Auth flow specifics

- Registration creates a Supabase Auth user **and** inserts a matching row into the `users` table using the service-role client; both must succeed or the user is half-created (no rollback currently).
- Login authenticates against Supabase Auth, then re-reads the `users` row for `{id, email, name}` and stuffs it into `req.session.user`.
- `requireAuth` is exported from `routes/auth.js` both via `router.requireAuth` and `module.exports.requireAuth`. Other routes import the latter.
- Password recovery: `/api/auth/forgot-password` calls `supabase.auth.resetPasswordForEmail` with `redirectTo = <current host>/`. The client's `DOMContentLoaded` handler in `app.js` reads `#type=recovery&access_token=…&refresh_token=…` from the hash, stashes tokens on `window.recoveryTokens`, and navigates to the reset view. `/api/auth/update-password` requires both tokens.
- Supabase email templates must point at the deployed host's root URL — `redirectTo` is computed from `x-forwarded-proto` + `host`, so Railway behind its proxy works out of the box.

## Conventions

- **Service-role everywhere on the server.** Never reach for the anon client for DB reads/writes — RLS is not the boundary.
- **Trust `req.session.user.id`** as the user identity; always filter queries by it. Every route that touches user data does `.eq('user_id', userId)`.
- **No try/catch wrappers** for promise-returning Express handlers beyond what already exists — match the surrounding style: `try { … } catch (err) { res.status(500).json({ error: err.message }) }`.
- **Frontend has no framework.** State lives in `client/app.js`'s exported `state` object; components import what they need from `app.js` and from each other. The DOM is queried directly. There is a pattern of `cloneNode(true)` + replace to defeat double-binding when re-initializing — preserve it.
- **CSS classes are hand-authored**, scoped by view selector. Variables in `:root` of `style.css`. Stay in the existing palette (`--gold`, `--text-dim`, `--user-color`, `--alert`, etc.).
- **No tests.** `test-stream.js` is a manual smoke script and currently points at a route (`/api/board/stream`) that doesn't exist — treat it as legacy until updated.
- **Comments are sparse.** Don't add narration comments; the code is small enough to read.

## Things to watch for when changing code

- The model string is in exactly one place: `server/lib/anthropic.js`. Don't sprinkle copies.
- Persona prompts are load-bearing — small edits change behavior across every session. Diff them carefully and prefer additive changes.
- `parseQuestion()` will strip the bracket from display but the full text (bracket included) is what gets persisted to `messages.content`. Don't change the persisted shape without also updating `conversationLog` rendering in `runBoardStream`.
- `getLogExtract()` truncates *prior session history* to the last 2000 words. The current round is sent in full. If you change history truncation, also reconsider `max_tokens` and per-member latency.
- The SPA fallback (`app.get('*', …)`) is mounted **after** the API routes, so order matters in `server/index.js`.
- `documents` rows can exist with `session_id = null` (unattached). Attach/detach is done by updating `session_id`, not by moving rows.
- Express session is in-memory — restart kills sessions and breaks any in-flight SSE.

## Deployment notes (Railway)

- `railway.json` healthcheck is `/api/health`, which always returns `{status:'ok'}` — it does not verify Supabase or Anthropic connectivity.
- `Procfile` and `railway.json.deploy.startCommand` both run `node server/index.js`; keep them in sync.
- `PORT` is injected by Railway; the server binds whatever `process.env.PORT` provides.

## Out of scope

This repo does not contain: migrations, fixtures, seed data, CI config, tests, linting, or type checking. Don't invent any of these without being asked.
