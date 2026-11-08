# DevLens

DevLens is a local-first developer toolkit that runs as a Manifest V3 browser
extension in Brave, Chrome, and Edge. It is designed for inspecting, shaping,
and testing web APIs without sending developer data to a backend.

This repository ships the extension foundation plus **JSON Studio**,
**JWT Inspector**, the **API Builder** request editor with send and response
inspection, **Network Inspector**, and the **Local AI Assistant** with streamed
Ollama chat. JSON is formatted, minified, validated, and explored entirely
on-device, JWTs are decoded and inspected without verification or network
access, and API requests are sent only when you press Send and grant Chrome
access to that origin. Network Inspector captures requests in an in-memory
DevTools session, and Local AI chats only with a validated loopback Ollama
endpoint without persisting prompts, responses, or conversation history.
Collections, Local AI payload context, and Page Inspector remain scaffolded or
future work.

## Stack

| Layer      | Choice                                         |
| ---------- | ---------------------------------------------- |
| UI         | React 19, TypeScript 7 (strict), Tailwind CSS 4 |
| Editor     | CodeMirror 6 (`@codemirror/lang-json`)          |
| Build      | Vite 8 (Rolldown), Manifest V3                 |
| Tests      | Vitest 5, Testing Library, jsdom               |
| Platform   | Chromium extensions (`chrome.*` APIs)          |
| Local AI   | Ollama over HTTP (`/api/tags`, `/api/chat`)    |

No backend, no cloud AI, no telemetry, and no analytics.

## Requirements

- Node.js 22.12 or newer (developed on Node 24.21)
- npm 11 or newer
- Brave, Google Chrome, or Microsoft Edge with Developer mode enabled

## Quick start

```bash
npm install
npm run dev      # UI-only Vite server; chrome APIs are unavailable
npm run build    # typecheck, build pages and workers, verify dist
npm test
```

`npm run dev` is useful for layout and styling work, but it is **not** a loadable
extension. Always load the generated `dist/` directory.

## Load the extension

Run `npm run build` first. Then:

### Google Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select `Desktop/DevLens/dist`.
4. Pin DevLens to the toolbar and open the popup.
5. Open DevTools with F12, then choose the **DevLens Network** panel.

### Microsoft Edge

1. Open `edge://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select `Desktop/DevLens/dist`.
4. Pin DevLens and open the popup. The DevTools panel is available under
   **DevLens Network**.

### Brave

1. Open `brave://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select `Desktop/DevLens/dist`.
4. Pin DevLens and open the popup. The DevTools panel is available under
   **DevLens Network**.

After a rebuild, click the reload button on the extension card. Refresh any
inspected page so its DevTools panel picks up new code.

## Scripts

| Command             | Purpose                                                        |
| ------------------- | -------------------------------------------------------------- |
| `npm run dev`       | Vite UI server (no extension APIs, no HMR in the extension)    |
| `npm run build`     | Typecheck, build pages, build `background.js`/`content.js`, verify |
| `npm run typecheck` | Strict TypeScript check only                                   |
| `npm test`          | Run all Vitest projects once                                   |
| `npm run test:watch`| Watch mode                                                     |
| `npm run verify`    | Validate `dist/` against the manifest                          |
| `npm run icons`     | Regenerate `public/icons/*.png`                                |
| `npm run preview`   | Serve built HTML (not a loadable extension)                    |

Single test file: `npx vitest run src/services/storage.test.ts`

Single test case: `npx vitest run -t "answers ping"`

## Project layout

```text
popup.html              Extension popup entrypoint
workspace.html          Full-page module workspace
devtools.html           Registers the DevTools panel
panel.html              DevTools network panel UI
public/manifest.json    Manifest V3 source, copied verbatim
src/background/         MV3 service worker and message handler
src/content/            Classic content script IIFE (built, not registered yet)
src/devtools/           DevTools page bootstrap and panel UI
src/popup/              Popup launcher
src/workspace/          Hash-routed workspace shell
src/features/           Independent module screens + registry
src/components/         Shared UI, layout, inline SVG icons
src/services/           chrome.storage / runtime messaging / settings
src/shared/             Pure types, module metadata, constants
src/styles/             Tailwind v4 theme tokens and base styles
scripts/                Separate worker build, artifact verify, icon generator
docs/                   Architecture and roadmap
```

## Current scope

Implemented:

- Manifest V3 output for Chromium browsers
- Popup launcher with background-worker health check
- Full workspace shell with six module routes; JSON Studio, JWT Inspector, API
  Builder, Network Inspector, and Local AI Assistant are functional; Page
  Inspector remains future work
- JSON Studio with a CodeMirror 6 editor, format, minify, validate, indentation,
  copy, swap, and clear actions
- Worker-backed JSON parsing with a synchronous fallback for environments
  without `Worker`
- Collapsible typed JSON tree with node/depth stats and bounded rendering
- JWT Inspector with local header/payload/signature decoding, registered-claim
  inspection, lifetime warnings, and explicit unverified-signature messaging
- API Builder request editor with method, URL, enabled/disabled params and
  headers, a content-type-aware body, validation, and reset
- API Builder Send with a user-gesture origin-permission prompt, loading and
  cancellation controls, and a response inspector for status, duration,
  headers, final URL, and JSON/text bodies
- Background API execution with optional origin-permission checks, bounded
  timeout, cancellation, a 2 MB response cap, and structured errors
- DevTools panel registration and inspected-tab context
- Network Inspector with live and snapshot capture, filtering, request details,
  lazy response previews, Copy as cURL, and HAR export
- Local AI Assistant with a loopback-only Ollama endpoint, optional-origin
  permission check, `/api/tags` model discovery, persisted model selection, and
  explicit connected/empty/unavailable states
- Local AI chat with streamed `/api/chat` responses, multiline composer,
  cancellation, New chat, Copy response, safe Markdown/code rendering, code-copy
  actions, and in-memory conversation state
- Typed background messaging and page-metadata contract
- Storage wrapper with a dev fallback outside extensions
- Premium dark design system, responsive layout, and inline icon set
- Tests plus a post-build artifact verifier

Not implemented yet:

- JWT signature verification
- API Builder collections, environments, request history, and
  copy-as-cURL/fetch
- Local AI payload context, saved conversation history, and cross-session chats
- Page Inspector and content-script registration
- Firefox support (Chromium-only manifest and `chrome.*` APIs)

## JSON Studio

Open the workspace, choose **JSON Studio**, paste or type a payload, and use the
action bar to format (2 or 4 spaces), minify, validate, copy, swap, or clear.
Successful parses populate a collapsible tree with type pills, array indexes,
object keys, node counts, and depth.

- Processing never leaves the extension. Parsing, formatting, minifying, and
  validation run in a Web Worker, with a synchronous fallback when workers are
  unavailable.
- JSON is held in memory only for the active screen. There is no automatic
  persistence, history, telemetry, or remote request.
- Error messages include line/column when the engine provides a location and
  can jump the input editor to that offset.
- The tree renders at most 100 children per container and 40 depth levels, with
  explicit “show more” and depth-limit messaging, so large payloads stay
  navigable.

Automated tests, typecheck, and the production build pass. The manual
Chrome/Edge/Brave smoke test is still pending.

## JWT Inspector

Open the workspace, choose **JWT Inspector**, paste a compact JWT, and select
**Decode** (or press `Ctrl`/`Cmd` + `Enter`). DevLens validates and decodes the
three segments entirely on-device.

- Header and payload are shown as read-only, syntax-highlighted JSON. Signature
  bytes are shown separately, with copy actions for each part.
- Registered claims `exp`, `iat`, `nbf`, `iss`, `sub`, `aud`, and `jti` are
  explained. Numeric dates are rendered against the local clock with relative
  lifetime text, and missing or non-standard values are flagged.
- The signature is **never verified**. Decoding does not prove authenticity, and
  the UI keeps that warning visible even for tokens with an empty signature.
- Tokens, decoded output, and claim results stay in memory for the active
  screen. There is no persistence, history, telemetry, or network request.

Automated tests, typecheck, and the production build pass. The manual
Chrome/Edge/Brave smoke test is still pending.

## Local AI Assistant

Open the workspace, choose **Local AI Assistant**, and confirm the Ollama
endpoint (default `http://127.0.0.1:11434`). **Check connection** asks Chrome
for access to that loopback origin, then calls `GET /api/tags` and lists the
models installed on the machine. Select a model, type a message, and send with
**Send** or `Enter`; use `Shift` + `Enter` for a newline. **Stop** cancels a
stream, **New chat** clears the in-memory transcript, and completed replies can
be copied whole or by code block.

- Only loopback HTTP(S) endpoints on `localhost`, `127.0.0.1`, or `[::1]` are
  accepted. Remote URLs, credentials, paths, queries, and fragments are
  rejected before any permission prompt or request.
- The endpoint and selected model are stored in `chrome.storage.local`.
  Connection status, discovered models, prompts, responses, and conversation
  messages stay in memory. API keys, payload context, and chat history are
  never persisted, and page, network, or API data is never attached
  automatically.
- Connection checks use `credentials: "omit"`, reject redirects, time out after
  5 seconds, and cap metadata at 1 MiB. Chat posts to `/api/chat` with
  `stream: true`, parses NDJSON incrementally, times out after 120 seconds of
  inactivity, caps the response at 2 MiB, and supports cancellation. Errors and
  stopped generations preserve any partial reply.
- Markdown is rendered as React nodes rather than injected HTML. Headings,
  lists, quotes, emphasis, inline code, and fenced code blocks are supported;
  code blocks include a copy action.
- If Chrome blocks the request, restart Ollama with
  `OLLAMA_ORIGINS=chrome-extension://*` so the extension origin is allowed.
  Loopback alone does not guarantee that the browser request is accepted.
- Payload context, saved conversations, and cross-session history are not
  implemented in this stage.

Automated tests and the production build pass. The manual Chrome/Edge/Brave
smoke test is still pending.

## Cross-browser notes

Chrome, Edge, and Brave share the same Chromium extension platform and load the
same `dist/` output. The code uses the `chrome.*` namespace, which all three
provide. `minimum_chrome_version` is `116`. Firefox is not currently supported.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Changelog](CHANGELOG.md)
- [Agent instructions](AGENTS.md)
