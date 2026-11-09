# AGENTS.md

## Repository state

- Project root: `Desktop/DevLens`. The Git root is `/mnt/c/USERS/tabiq/Desktop/Devlens`, not the Windows home directory, and it has commits.
- Never run `git add -A`, `git reset`, or force-push. If asked to commit, stage explicit paths under `Desktop/DevLens` only.
- Use npm (Node >= 22.12; developed on Node 24.21 / npm 11.19). `package-lock.json` is authoritative; do not switch package managers.
- JSON Studio, JWT Inspector, and API Builder through Stage 3B-3 are implemented
  and tested; Send, permission prompting, response inspection, and the 2 MB
  response cap are wired. Network Inspector Stage 1A/1B/1C is implemented and
  tested: live capture, a bounded in-memory session, pause/clear, filtering,
  request details, normalized initiator data, on-demand response-body
  previews, Copy as cURL, and HAR export. Local AI Assistant Stage 2A/2B/2C is
  implemented and tested: loopback-only Ollama endpoint validation, connection
  checks, `/api/tags` model discovery, persisted endpoint/model selection,
  streamed `/api/chat`, safe Markdown/code rendering, cancellation, in-memory
  conversations, and explicit code assistance modes with prompt templates and
  user-entered code/error context. Page Inspector is implemented and tested:
  explicit active-tab inspection, bounded overview/structure/links/images/forms
  collection, lightweight accessibility heuristics, and on-demand
  `activeTab` + `scripting` content-script injection. Collections, automatic
  Local AI payload context, and saved histories remain future work unless their
  milestone is explicitly requested.
  Manual Chrome/Edge/Brave smoke testing for API Builder, Network Inspector,
  Local AI, and Page Inspector is still pending. Treat JSON Studio as the
  reference feature.

## Commands

- `npm run build` — the gate: typecheck → page build → background/content build → artifact verification.
- `npm run typecheck` — `tsc --noEmit` (strict TS; this is the only static-analysis step, no ESLint/Prettier).
- `npm test` — Vitest. Single file: `npx vitest run src/services/storage.test.ts`. Single case: `npx vitest run -t "answers ping"`.
- `npm run verify` — validates `dist/` against the manifest and checks the hashed JSON worker asset; requires a build first.
- `npm run dev` — Vite UI server only. Extension APIs are absent, so the popup status shows Offline.
- `npm run icons` — regenerates `public/icons/*.png` from `scripts/generate-icons.mjs`.
- `npm run preview` — serves built HTML; it is not a loadable extension.

## Architecture that is easy to break

- Entrypoints: `popup.html`, `workspace.html`, `devtools.html`, `panel.html` at the repo root. `devtools.html` only registers the panel; `panel.html` is the network UI.
- Builds are two-pass. `vite build` empties `dist` and builds pages plus the hashed `json-worker-*.js` asset; `scripts/build-scripts.mjs` then adds `background.js` and `content.js` with `emptyOutDir: false`. Keep that order.
- Background and content bundles must stay self-contained. Do not import React, DOM-only modules, or `src/services/storage` into the background. Content is built as a classic IIFE (no ESM imports).
- `public/manifest.json` is copied verbatim. Renaming a build output requires changes in `scripts/build-scripts.mjs` and `scripts/verify-build.mjs`; update the manifest too when it references that file (`background.js` today, `content.js` once registered). The JSON worker is a Vite-hashed, non-manifest asset; do not hardcode its filename.
- JSON processing is pure in `src/features/json/json-core.ts`, shared by `json-worker.ts` and the synchronous fallback. Keep Chrome APIs, DOM, storage, network, and `eval` out of the core and worker. JSON Studio must never persist payloads or add history without an explicit requirement.
- API Builder keeps the pure execution contract in `src/features/api/api-execution.ts`, the background executor in `src/background/api-execution.ts`, and the UI client in `src/services/api-execution.ts`. Send checks `hasOriginPermission` first, then requests only from the click when missing. Origin patterns use protocol plus hostname and omit ports.
- Local AI Stage 2A/2B/2C keeps the pure loopback validator and `/api/tags` parser in `src/features/ai/ollama.ts`, the NDJSON stream parser in `src/features/ai/chat.ts`, the safe Markdown parser/renderer in `src/features/ai/markdown.ts` and `markdown-message.tsx`, the pure mode/template/context contract in `src/features/ai/assist.ts`, the provider contract in `src/features/ai/provider.ts`, and the Ollama fetch client in `src/services/local-ai.ts`. The workspace screen and `LocalAiChat` fetch directly after an optional-origin permission request; they do not use the background. `LocalAiAssistFields` only renders the task, template, code, language, and error inputs. Validate loopback before requesting or fetching, keep `credentials: "omit"` and `redirect: "error"`, and document `OLLAMA_ORIGINS` rather than implying CORS always works. `/api/chat` streams NDJSON with a 120 s inactivity timeout, a 2 MB capped response, and `AbortController` cancellation. Providers accept a validated `system` message for one explicit developer-context prompt. Conversation messages and explicitly entered code/errors stay in memory only; no prompts, code, payloads, responses, or histories are persisted, and page/network/API data is never attached automatically. Render Markdown as React nodes, never with `dangerouslySetInnerHTML`, and do not add a Markdown dependency.
- Network export is split into pure `network-curl.ts` and `network-har.ts`, with clipboard/download side effects in `network-io.ts`. HAR includes only response bodies the user explicitly loaded, capped at 1 MiB; generated commands and HAR payloads stay in memory and are never persisted or logged. Do not add permissions or automatic export.
- Page Inspector keeps the typed contract, bounded DOM collector, and runtime guards in `src/features/page/page-inspection.ts`, the injection/messaging client in `src/services/page-inspection.ts`, and the content handler in `src/content/index.ts`. `openWorkspace()` captures the active tab id and passes `?targetTabId=<id>` before the hash route. Inspect injects `content.js` with `activeTab` + `scripting` only after the user acts. Never read entered form values, passwords, cookies, storage, or auth data; derive form metadata from labels and attributes only. Keep the content script out of `content_scripts`, keep snapshots in memory, and never persist, transmit, mutate the page, or attach snapshots to Local AI automatically.
- CodeMirror 6 owns the JSON editor. Keep the package set minimal (`@codemirror/{state,view,commands,language,lang-json}` plus `@lezer/highlight`); do not add editor wrappers or UI libraries.
- The content script builds but is intentionally not registered under `content_scripts`, to avoid persistent host access. Page Inspector injects it on demand through `chrome.scripting.executeScript` after the user presses Inspect. Do not add always-on host access.
- `src/shared/modules.ts` owns module metadata and hash routing; `src/features/registry.ts` maps ids to screens. Add a module in both.
- Workspace routes are `#/<moduleId>`; unknown routes fall back to `json`. Popup opens the workspace with `openWorkspace()`.
- `src/shared` is pure types/constants. `src/services` wraps chrome APIs. `src/components` is shared UI. Feature logic belongs in `src/features/<module>/`.

## Conventions and constraints

- Tailwind v4 is CSS-first: tokens and base styles live in `src/styles/index.css`; there is no `tailwind.config.*`. Use the existing `cn` helper and components.
- No icon, font, or animation libraries. Icons are inline SVG in `src/components/icons.tsx`; fonts are system stacks (MV3 CSP allows no remote assets). CodeMirror is the only editor dependency.
- Active permissions are intentionally minimal (`storage`, `activeTab`, and
  `scripting`). `activeTab`/`scripting` power user-initiated Page Inspector
  injection; there is no `content_scripts` registration.
  `optional_host_permissions` declares HTTP(S) origins for user-initiated API
  sends and local Ollama checks. API Builder's background only checks access;
  Send and Local AI request an origin from the user gesture when missing, and
  origin patterns omit ports. Do not add permissions or host access without
  updating `manifest.json`, `docs/ARCHITECTURE.md`, and tests.
- Version lives in both `package.json` and `public/manifest.json`; `src/manifest.test.ts` fails if they drift.
- Strict TS uses `noUncheckedIndexedAccess` and `verbatimModuleSyntax`; use `import type` for type-only imports.
- No fake data or believable placeholder UI. All six module screens are functional; Collections, saved histories, and automatic AI context remain future work. JSON Studio, JWT Inspector, API Builder through Stage 3B-3, Network Inspector through Stage 1C, Local AI Stage 2A/2B/2C, and Page Inspector are implemented.
- Tests run in two Vitest projects: `node` for pure logic (including `json-core`, API execution contracts, Ollama endpoint/model parsing, Local AI mode/template/context validation, chat NDJSON parsing, Markdown parsing, response formatting, cURL generation, and HAR serialization), `dom` (jsdom) for components/storage, the JSON tree/screen, API Builder send/response states, network export actions, Local AI connection/model states, chat streaming, explicit code/error context, Markdown/code rendering, and Page Inspector collection, content handling, injection, privacy limits, and screen states. Mock `chrome` with `vi.stubGlobal`; cleanup is in `src/test/setup.ts`.

## Gotchas

- `dist/` is generated; never edit or commit it.
- There is no HMR inside the extension. After `npm run build`, reload the unpacked extension (and refresh the inspected page) to pick up changes.
- Vite 8 uses Rolldown: use `codeSplitting: false` for single-file bundles; `inlineDynamicImports` is deprecated. The JSON worker relies on `worker.format: "es"` and a runtime `new URL(..., import.meta.url)`.
- MV3 service workers cannot use `window`/`localStorage`; storage code must continue to guard for that.
- The workspace scroll container is `<main>`, not the window; reset its scroll when route changes.
- CodeMirror 6 renders under jsdom. In editor integration tests, use `EditorView.findFromDOM(element)` and dispatch changes inside `act`; do not synthesize DOM text mutations.

## Docs

`README.md` (setup/load), `docs/ARCHITECTURE.md` (runtime model/decisions), `docs/ROADMAP.md` (milestones), `CHANGELOG.md`.
