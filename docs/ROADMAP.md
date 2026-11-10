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

### Stage 1A — Live capture and list (implemented)

Shipped:

- Live `onRequestFinished` capture plus a `getHAR()` snapshot, normalized into
  method, URL, status, resource type, size, duration, headers, query parameters,
  and post data.
- Bounded in-memory session with pause/resume, clear, and summary counts.
- Filtering by resource type, status class, domain, and text.
- Request detail tabs for Overview, Request, Response, and Timing, with empty and
  failure states.
- Network model, capture, formatting, and panel tests, with no persistence,
  telemetry, or new permissions.

### Stage 1B — Response preview and initiator (implemented)

Shipped:

- On-demand response bodies through the retained `getContent()` handle; no
  automatic body fetching.
- JSON formatting through the pure `json-core` formatter, raw-text fallback,
  Base64 text decoding, and a 1 MiB preview cap.
- Explicit empty, binary, unavailable, malformed, and unsupported-encoding
  states; previews are rendered as text and never persisted.
- Deduplicated and stale-safe loading, plus retry after a failed load.
- Normalized initiator type, source, location, and bounded call stack in the
  request Overview.
- Pure content, model, capture, and panel tests for lazy loading, duplicates,
  stale results, binary content, failures, initiators, and payload formatting.

### Stage 1C — cURL and HAR export (implemented)

Shipped:

- Copy a selected request as a single-line POSIX cURL command, including method,
  URL and query parameters, captured headers, request payloads, and a
  post-data `Content-Type` fallback when the header is absent.
- HAR 1.2 export for the captured session through a pure serializer, with
  explicit fallbacks for missing status, timing, size, and start-time data.
- HAR response content includes only bodies the user explicitly loaded during
  the session; text is capped at 1 MiB and truncation is noted in the export.
- Clipboard and local download actions with success/failure feedback, a
  sensitive-data warning for copied commands, and no new permissions.
- Pure cURL/content/HAR tests plus panel tests for copy, loaded-body export,
  disabled empty exports, and object-URL cleanup.

Remaining for Milestone 1: the Chrome/Edge/Brave manual smoke test.

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
- Stage 3A messaging that execution, host permissions, response rendering,
  collections, and history were not part of that stage.
- Pure request-model helpers and focused model/screen tests.
- No network requests, persistence, telemetry, or new permissions.

Known limitations at this stage: auth and body options beyond content type are
not implemented; nothing is saved between sessions.

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
- No `fetch`, host permission, persistence, or Send wiring at this stage.

Known limitations: this stage only defined the contract and routing. Stage 3B-2
replaced the `not-implemented` path with real background execution.

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
  `requestOriginPermission` exists for the user-initiated Send control added in
  Stage 3B-3.
- No persistence, logging, request replay, or backend service.

Known limitations: cancellation only works while the service worker remains
alive; custom redirect handling, retries, collections, environments, and history
remain future work. Stage 3B-3 completes Send and response inspection, including
the 2 MB streamed cap.

#### Stage 3B-3 — Send and response inspector (implemented)

Shipped:

- Send wired from the request editor, with duplicate sends blocked while loading
  and cancellation through the background worker.
- Origin permission checked with `hasOriginPermission` first; when missing, the
  click requests it from the user gesture before execution. Denied prompts are
  surfaced without sending. Origin patterns omit ports.
- Response inspector showing status, status text, duration, content type, final
  URL, response headers, and body. HTTP 4xx/5xx remain successful transports.
- JSON response formatting through the pure `json-core` formatter, with raw-text
  fallback for malformed JSON, plain text handling, and an explicit empty state.
- Streamed response-body cap of 2 MB with a structured `response-too-large`
  failure before the full body is buffered.
- No persistence, history, logging, telemetry, or response markup injection.

Acceptance: permission grant, denial, loading, cancellation, timeout, HTTP
errors, malformed JSON, and oversized responses are covered by automated tests;
`npm run build` passes. Manual Chrome/Edge/Brave smoke testing remains pending.

Known limitations: cancellation only works while the service worker remains
alive; custom redirect handling, retries, collections, environments, and history
remain future work.

Remaining API Builder work:

- Save collections and environments in `chrome.storage.local`.
- Copy as cURL/fetch; replay history.

## Milestone 4 — Local AI Assistant

- Settings for the Ollama endpoint, default `http://127.0.0.1:11434`.
- Health check and model list from the local endpoint.
- Streaming explanations for explicitly selected code or errors, without
  automatic payload attachment.
- In-memory conversation context with explicit clear.
- Clear offline/unavailable states.

Acceptance: no request leaves localhost; the UI degrades cleanly when Ollama is
not running; payloads are sent only after a user action.

### Stage 2A — Ollama connection and model discovery (implemented)

Shipped:

- Loopback-only endpoint validation for `localhost`, `127.0.0.1`, and `[::1]`,
  with credentials, paths, queries, and fragments rejected before any
  permission prompt or request.
- User-gesture optional-origin permission request, loopback `GET /api/tags`
  discovery, a 5 s timeout, no credentials, rejected redirects, and a streamed
  1 MiB metadata cap.
- Connection screen with not-checked, checking, connected, permission,
  unavailable, malformed, oversized, empty-model, and missing-saved-model
  states.
- Persisted endpoint and selected model, with malformed stored values repaired
  to defaults and no model assumed before the user selects one.
- Pure endpoint/model, provider, settings, and screen tests. No prompts,
  payloads, responses, connection status, or conversation history are stored.
- `OLLAMA_ORIGINS` guidance and no manifest or broad host-permission change.

Stage 2A is implementation-complete.

### Stage 2B — Streamed chat and safe rendering (implemented)

Shipped:

- In-memory chat UI with the selected installed model, a multiline composer,
  `Enter` to send, `Shift` + `Enter` for a newline, Send, Stop, New chat, and
  Copy response.
- User-gesture optional-origin permission from Send, with explicit disabled,
  empty, streaming, cancelled, and error states.
- Loopback `POST /api/chat` with `stream: true`, incremental NDJSON parsing,
  no credentials, rejected redirects, a 120 s inactivity timeout, a 2 MiB
  response cap, and `AbortController` cancellation.
- Partial-output preservation and fixed errors for malformed, empty, incomplete,
  oversized, timed-out, unavailable, and permission-denied responses.
- Safe Markdown rendering as React nodes, including headings, lists, quotes,
  emphasis, inline code, fenced code blocks, and code-copy actions, with no
  injected HTML or Markdown dependency.
- Chat tests covering parser boundaries, streaming, cancellation, permissions,
  composer behavior, error states, and safe rendering. Conversations, prompts,
  and responses stay in memory only.

### Stage 2C — Developer context and code assistance (implemented)

Shipped:

- Chat, Explain code, Review code, and Debug modes in the existing in-memory
  Local AI chat.
- Mode-specific developer prompt templates that fill the composer and can be
  edited before sending.
- Explicit code, language, and error fields. Explain and Review require code;
  Debug accepts code, error output, or both.
- One constrained system message that marks supplied code and errors as
  untrusted data, includes no automatic page/network/API data, and is sent only
  when the user presses Send.
- Provider `system` role support plus pure mode, template, validation, and
  prompt-building tests.
- New chat clears the transcript, mode, template, and explicit context. No
  context or conversation is persisted.

Remaining for this milestone: automatic payload context, saved history,
retrieval, and manual Chrome/Edge/Brave smoke testing.

## Milestone 5 — Page Inspector (implemented)

Shipped:

- Explicit Inspect page action with idle, loading, ready, and error states, and
  a Clear action that discards the in-memory snapshot.
- Overview metadata: title, URL, meta description, canonical URL, language, and
  viewport.
- Heading hierarchy with missing-H1 and heading-level-jump flags, plus links,
  images, and forms with bounded collections and explicit empty states.
- Link text, destination, target, new-tab, and empty/missing-text flags; image
  source, alt text, natural/display dimensions, and missing-alt flags.
- Form action, method, control names/types, labels, placeholders, and
  required/disabled state. Entered values, passwords, cookies, storage, and
  authentication data are never read.
- Lightweight accessibility findings for missing alt text, unlabeled controls,
  empty links, missing title/lang/meta/viewport, missing or multiple H1,
  heading jumps, and a missing main landmark. The UI qualifies these as
  heuristics, not a WCAG compliance claim.
- On-demand `activeTab` + `scripting` injection of the built `content.js`; no
  `content_scripts` registration and no broad host access. The popup captures
  the active tab id and passes it before the hash route.
- Restricted pages and missing target tabs fail gracefully, and snapshots stay
  in memory without persistence, external transmission, page mutation, or
  automatic Local AI attachment.
- Collector, content-handler, injection-service, and screen tests covering
  privacy boundaries, limits, explicit action, restricted pages, missing target,
  loading, errors, and clearing.

Remaining: Open Graph, script, and stylesheet panels; manual Chrome/Edge/Brave
smoke testing.

Acceptance: no host access is granted before the user acts; the content script
runs only on the active tab after Inspect; collections are bounded; snapshots
are never persisted or transmitted; permissions are documented here and in the
manifest.

## Milestone 6 — Final integration and UI refinement (implemented)

Shipped:

- Audit of all six module screens, the popup, workspace shell, and DevTools
  panel for stale copy, inconsistent widths, duplicated UI, and accessibility
  gaps.
- Shared `Notice`, `Tabs`, `Spinner`, and field-style primitives, with duplicate
  module-local status, clipboard, spinner, and input code removed.
- Compact shell and visual pass: skip link, focusable main scroll container,
  corrected module metadata, accurate Network Inspector workspace landing page,
  restrained typography/shadows, and consistent `max-w-7xl` content widths.
- Keyboard-navigable tabs, labelled tab panels, visible JWT copy labels, and
  stronger JSON/JWT focus states.
- Local AI chat scroll-follow only when the reader is near the bottom, plus
  clipboard cleanup on failure.

Acceptance: all module behavior and privacy boundaries are unchanged; focused
tests, the full suite, typecheck, build, and artifact verification pass. Manual
Chrome/Edge/Brave smoke testing remains a release task.

## Hardening and release

- Cross-browser smoke tests in Chrome, Edge, and Brave.
- Accessibility pass on popup, workspace, and panel.
- Bundle-size budget and dependency review.
- Privacy statement and store listing assets.
- Versioning and release checklist.
