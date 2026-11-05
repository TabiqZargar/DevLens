# Roadmap

Milestones are ordered by dependency and risk. A milestone is
implementation-complete when its logic is tested and `npm run build` passes.
Release-ready also requires a manual smoke test in built extensions loaded in
Chrome, Edge, and Brave.

## Milestone 0 — Foundation (complete)

Shipped in `0.1.0`:

- Manifest V3 build for Chromium browsers
- Popup, workspace, DevTools page, and network panel shells
- Module registry, hash routing, navigation, and scaffold screens
- Tailwind v4 design system, shared components, inline icon set
- Typed background messaging, storage wrapper, settings defaults
- Vitest projects and post-build artifact verification
- Architecture, agent, and user documentation

Known limitations at `0.1.0`: feature modules are scaffolds; no network, JSON,
JWT, API, Ollama, or Page Inspector behavior; content script is built but
unregistered; Firefox is unsupported.

## Milestone 1 — Network Inspector

- Subscribe to `chrome.devtools.network.onRequestFinished` in the panel.
- Capture method, URL, status, type, size, duration, and initiator.
- Keep a bounded in-memory session; provide clear and pause controls.
- Filter by resource type, status class, domain, and text.
- Request detail: headers, payload, timings, and response preview.
- Copy as cURL; export the session as HAR.

Acceptance: live requests appear without reloading the panel; clearing removes
all rows; no request bodies are persisted to storage by default; panel remains
responsive with at least 1,000 captured requests.

## Milestone 2 — JSON Studio and JWT Inspector (implemented)

### JSON Studio

Shipped:

- CodeMirror 6 editor with JSON syntax highlighting, line numbers, and folding.
- Format with 2- or 4-space indentation, minify, validate, copy, swap, and clear.
- Pure `json-core` processing shared by a Web Worker and a synchronous fallback.
- Typed text output plus a collapsible tree with indexes, keys, type pills, node
  counts, and depth.
- Error messages with line/column when available and a jump-to-offset action.
- No persistence, history, network, telemetry, or `eval`.

Acceptance: malformed input reports line/column where the engine provides it;
large trees render with bounded children/depth; core, tree, and screen tests
pass; `npm run typecheck`, `npm test`, `npm run build`, and `npm run verify`
pass. Multi-megabyte profiling and the Chrome/Edge/Brave manual smoke test remain
release tasks.

Known limitations: the tree shows the first 100 children per container and 40
depth levels; JSON is intentionally not saved between sessions.

### JWT Inspector

Shipped:

- Decode compact-JWT header, payload, and signature segments locally, with
  Base64URL, UTF-8, JSON, and object-shape validation.
- Read-only syntax-highlighted header and payload JSON plus copy actions for
  each decoded part and the raw signature segment.
- Registered-claim inspection for `exp`, `iat`, `nbf`, `iss`, `sub`, `aud`, and
  `jti`, with readable timestamps and local-clock lifetime states.
- Expired, not-yet-valid, future-issued, missing, and non-standard claim states.
- Persistent unverified-signature messaging; decoding is explicitly not proof
  of authenticity.
- No persistence, history, network, telemetry, or `eval`.

Acceptance: JWT claims and expiry states are correct against fixtures; core,
claim, and screen tests pass; `npm run typecheck`, `npm test`, `npm run build`,
and `npm run verify` pass.

Known limitations: cryptographic signature verification is not implemented. The
Chrome/Edge/Brave manual smoke test remains a release task.

## Milestone 3 — API Builder

### Stage 3A — Request editor (implemented)

Shipped:

- In-memory request draft with method, URL, enabled/disabled query parameters,
  enabled/disabled headers, and a body with a content-type selection.
- Method selector (GET, POST, PUT, PATCH, DELETE), absolute http/https URL
  validation, add/remove/reset controls, and explicit empty states.
- Clear messaging that sending, host permissions, responses, collections, and
  history are not part of this stage.
- Pure request-model helpers and focused model/screen tests.
- No network requests, persistence, telemetry, or new permissions.

Known limitations: the Send control is intentionally disabled; auth and body
options beyond content type are not implemented; nothing is saved between
sessions.

### Stage 3B — Request execution

#### Stage 3B-1 — Execution contract (implemented)

Shipped:

- Typed `devlens:api-execute` request/response contract in
  `src/features/api/api-execution.ts`, built from the normalized request draft.
- Runtime validation of methods, absolute http/https URLs, enabled rows, body
  content types, and request ids, with fixed non-leaking error messages.
- Background routing that distinguishes ping, execution, and unsupported
  messages and returns a structured `not-implemented` error for valid execution
  requests.
- `sendApiExecutionMessage` service wrapper that validates the response shape
  and request id, with structured `runtime-unavailable`, `runtime-error`, and
  `invalid-response` failures.
- Contract, router, and sender tests asserting no network request is made.
- No `fetch`, no host permissions, no persistence, and the Send control remains
  disabled.

Known limitations: this stage only defined the contract and routing. Stage
3B-2 replaces the `not-implemented` path with real background execution.

#### Stage 3B-2 — Background HTTP execution (implemented)

Shipped:

- Service-worker `fetch` execution from validated requests: method, URL,
  enabled query parameters, enabled headers, and supported body content types.
  Body content type is applied unless the caller supplies a `Content-Type`
  header; `none` bodies send no body.
- Bounded request timeout (default 30 s, 1–120 s allowed) validated by the
  contract and enforced with `AbortController`.
- Cancellation through `devlens:api-cancel` while the worker is alive, with
  timeout and cancellation reported separately.
- Structured success responses containing request id, HTTP status and status
  text, response headers, body text, duration, content type, and final URL.
  HTTP 4xx/5xx responses are preserved as successful transports.
- Structured failures for `permission-denied`, `network-error`, `timeout`,
  `aborted`, `unsupported` (for example a GET with a body), and
  `invalid-request`, all with fixed non-leaking messages. Empty and non-JSON
  response bodies are returned as text.
- Optional host permissions for `http://*/*` and `https://*/*`; the background
  checks `chrome.permissions.contains` before fetching and never prompts.
  `requestOriginPermission` exists for the future user-initiated Send control.
- No persistence, logging, request replay, or backend service.

Known limitations: the Send control and response UI are not implemented, so
permission prompting is deferred; cancellation only works while the service
worker remains alive; response bodies are buffered as text with no size cap;
redirect policy, streaming, retries, collections, environments, and history
remain future work.

Remaining API Builder work:

- Wire Send and response rendering, requesting origin permission from the
  user-initiated control before execution.
- Save collections and environments in `chrome.storage.local`.
- Copy as cURL/fetch; replay history.

## Milestone 4 — Local AI Assistant

- Settings for the Ollama endpoint, default `http://127.0.0.1:11434`.
- Health check and model list from the local endpoint.
- Streaming explanations for selected JSON/network payloads.
- In-memory conversation context with explicit clear.
- Clear offline/unavailable states.

Acceptance: no request leaves localhost; the UI degrades cleanly when Ollama is
not running; payloads are sent only after a user action.

## Milestone 5 — Page Inspector

- Register the content script only when the feature is used.
- Prefer `activeTab` + `scripting` injection over broad host access.
- Show title, URL, metadata, Open Graph tags, scripts, styles, and images.
- Flag accessibility basics: landmarks, missing labels, lang, and alt text.
- Keep all inspection local and scoped to the active tab.

Acceptance: no host access is granted before the user acts; the content script
does not run on pages where it is not needed; permissions are documented here
and in the manifest.

## Hardening and release

- Cross-browser smoke tests in Chrome, Edge, and Brave.
- Accessibility pass on popup, workspace, and panel.
- Bundle-size budget and dependency review.
- Privacy statement and store listing assets.
- Versioning and release checklist.
