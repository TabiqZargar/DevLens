# Changelog

All notable changes to DevLens are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
semantic versioning.

## [Unreleased]

### Added

- JSON Studio with a CodeMirror 6 editor, JSON syntax highlighting, line
  numbers, and folding.
- Format (2 or 4 spaces), minify, validate, copy, swap, and clear actions.
- Worker-backed JSON parsing with a typed worker protocol and a synchronous
  fallback when `Worker` is unavailable.
- Collapsible typed JSON tree with object keys, array indexes, type pills, node
  counts, depth stats, and bounded rendering.
- Error messages with line/column when available, plus a jump-to-error action.
- JSON core, tree, and screen tests, including a CodeMirror integration test.
- Build verification for the hashed JSON worker asset.
- JWT Inspector with local compact-JWT decoding, Base64URL and UTF-8
  validation, read-only header/payload JSON, signature-segment display, and
  copy actions.
- Registered-claim inspection for `exp`, `iat`, `nbf`, `iss`, `sub`, `aud`, and
  `jti`, with local-clock expiry/not-before/issued-in-future states and
  missing/non-standard value handling.
- Explicit unverified-signature messaging and an empty-signature state.
- JWT core, claims, and screen tests, including deterministic claim-clock and
  no-network checks.
- API Builder request editor with method selection, absolute URL validation,
  enabled/disabled query parameter and header rows, a content-type-aware body
  editor, reset, and explicit empty states.
- Pure API request-model helpers and focused model/screen tests covering row
  normalization, query strings, URL validation, and no network or storage use.
- API execution contract (`devlens:api-execute`) with typed normalized request
  and response payloads, runtime validation, and fixed non-leaking error codes.
- Background routing for ping, execution, and unsupported messages, returning a
  structured `not-implemented` result for valid execution requests.
- `sendApiExecutionMessage` sender wrapper with response-shape and request-id
  validation.
- Contract, background-router, and sender tests asserting no network request is
  made.
- Background HTTP execution for validated API requests, including method, URL,
  enabled query parameters, headers, and supported body content types.
- Bounded request timeout (default 30 s) and cancellation via
  `devlens:api-cancel`, with distinct timeout and aborted results.
- Structured success results with status, status text, response headers, body
  text, duration, content type, and final URL; HTTP error statuses are
  preserved as responses.
- Structured `permission-denied`, `network-error`, `timeout`, `aborted`,
  `unsupported`, and `invalid-request` failures with fixed messages.
- Optional host permissions for HTTP(S) origins, an origin-permission check
  used by the background, and explicit permission helpers for the user-initiated
  Send control wired in Stage 3B-3.
- Executor, router, permission, contract, and sender tests covering success,
  query/header/body handling, timeouts, cancellation, HTTP errors, empty and
  non-JSON bodies, missing permission, network failures, and sensitive-error
  redaction.
- API Builder Send wired to the execution service, with duplicate sends blocked
  while loading and cancellation through the background worker.
- Origin permission checked before sending and requested from the Send click
  when missing; denied prompts are shown without execution.
- Response inspector showing status, status text, duration, content type, final
  URL, response headers, and body, with HTTP 4xx/5xx preserved as responses.
- JSON response formatting through the pure `json-core` formatter, with raw-text
  fallback for malformed JSON, plain text handling, and an explicit empty state.
- Streamed response-body limit of 2 MB and a structured `response-too-large`
  failure before the full body is buffered.
- API Builder send, permission, response, formatting, cancellation, and
  oversized-response tests.
- Network Inspector live capture and a `getHAR()` snapshot normalized into
  method, URL, status, resource type, size, duration, headers, query parameters,
  and post data.
- Bounded in-memory network session with pause/resume, clear, summary counts,
  and filtering by resource type, status class, domain, and text.
- Request detail tabs for Overview, Request, Response, and Timing, with
  explicit empty states.
- On-demand response-body previews through the retained `getContent()` handle,
  with JSON formatting, raw-text fallback, Base64 text decoding, and a 1 MiB
  preview cap.
- Explicit empty, binary, unavailable, malformed, and unsupported-encoding
  response states, plus deduplicated and stale-safe loading with retry.
- Normalized initiator type, source, location, and bounded call stack in the
  request Overview.
- Copy as cURL for the selected request, with URL/query data, captured headers,
  request payloads, content-type fallback, POSIX shell quoting, and a
  sensitive-data warning.
- HAR 1.2 export for the captured session, including request/response metadata,
  query strings, headers, post data, and only explicitly loaded response
  bodies with the 1 MiB cap and a truncation comment.
- Clipboard and local HAR download feedback, with empty-session export disabled
  and no new permissions or persistence.
- Network content, model, capture, formatting, cURL, HAR, and panel tests
  covering lazy loading, duplicate and stale results, binary content, failures,
  initiators, filtering, payload formatting, copy, loaded-body export, export
  failure, and object-URL cleanup.
- Local AI Assistant Stage 2A with a loopback-only Ollama endpoint, a
  user-gesture optional-origin permission check, and `/api/tags` model
  discovery.
- `LocalAiProvider` contract plus a typed `fetch` client with a 5 s timeout,
  no credentials, rejected redirects, and a streamed 1 MiB metadata cap.
- Ollama endpoint validation that rejects remote hosts, credentials, paths,
  queries, and fragments before any permission prompt or request.
- Local AI connection screen with explicit not-checked, checking, connected,
  permission, unavailable, malformed-response, oversized-response, empty-model,
  and missing-saved-model states.
- Persisted Ollama endpoint and selected model settings, with malformed stored
  values repaired to defaults.
- Pure endpoint/model, provider, settings, and Local AI screen tests covering
  loopback validation, permissions, discovery, timeouts, malformed and
  oversized responses, empty states, and persisted model restoration.
- Local AI Assistant Stage 2B with an in-memory chat, a multiline composer,
  Send, Stop, New chat, Copy response, and user-gesture permission handling.
- Streamed loopback `POST /api/chat` with incremental NDJSON parsing, a 120 s
  inactivity timeout, a 2 MiB response cap, cancellation, and preserved partial
  output on errors.
- Safe Markdown rendering as React nodes with fenced code blocks and code-copy
  actions, without injected HTML or a Markdown dependency.
- Chat NDJSON parser, provider streaming, Markdown, composer, cancellation,
  permission, partial-output, and safe-rendering tests.

### Changed

- The background execution handler now performs a validated request instead of
  returning `not-implemented`.
- Background message handling now validates all incoming messages and always
  responds; unexpected failures return a fixed message instead of raw errors.
- API Builder Send is now enabled; origin patterns use protocol plus hostname
  and omit ports because Chrome match patterns do not support them.
- Background responses are read as streams and capped at 2 MB.
- Local AI metadata responses are read as streams and capped at 1 MiB.
- Settings now include the selected Ollama model alongside the endpoint.
- Added minimal CodeMirror 6 dependencies and `worker.format: "es"` to Vite.
- Updated module metadata and documentation for JSON Studio, JWT Inspector, API
  Builder through Stage 3B-3, Network Inspector through Stage 1C, and Local AI
  Stage 2A/2B.

### Notes

- JSON input, output, tree state, and errors stay in memory for the active
  screen. There is no persistence, history, telemetry, or network request.
- JWT tokens, decoded output, and claim results stay in memory for the active
  screen. Tokens are never persisted or transmitted, and signatures are not
  verified.
- API request drafts, headers, bodies, and responses stay in memory for the
  active screen. Send checks optional origin permission first and requests it
  from the user gesture only when missing. Stage 3B-2 executes requests in the
  background and never persists or logs request/response data; Stage 3B-3 wires
  Send and response inspection, rejects response bodies over 2 MB, and formats
  JSON with a raw-text fallback. Cancellation depends on the service worker
  staying alive for the duration of the request.
- Network sessions stay in memory and are bounded; requests and response bodies
  are never persisted or logged. Response bodies are fetched only when the user
  clicks Load, previews are capped at 1 MiB, and binary or unavailable content is
  shown explicitly. Chrome may still materialize the full body internally when
  `getContent()` runs. Snapshot entries from `getHAR()` do not expose body
  accessors.
- Local AI Stage 2A/2B stores only the normalized Ollama endpoint and selected
  model. Prompts, responses, model metadata, connection status, and conversation
  messages stay in memory and are discarded by New chat, route changes, or
  reload. The screen fetches only `GET /api/tags` and `POST /api/chat` from a
  validated loopback endpoint after the user checks the connection or sends a
  message and grants optional origin access; Ollama may still require
  `OLLAMA_ORIGINS` for the extension origin. Payload context and saved or
  cross-session history are not implemented in this stage.
- Copy as cURL and HAR export are explicit user actions. Copied commands may
  contain credentials or sensitive headers, and exported HAR files include
  loaded response bodies; both stay in memory and are never persisted or
  logged by DevLens.
- The JSON tree renders at most 100 children per container and 40 depth levels.
- Automated tests cover the implemented features; `npm run build` runs
  typecheck, both builds, and artifact verification. The manual
  Chrome/Edge/Brave smoke test is still pending.

## [0.1.0] - 2026-11-04

### Added

- React 19 + TypeScript + Vite 8 foundation for a Manifest V3 extension.
- Popup launcher with workspace navigation and a live background-worker status.
- Full-page workspace with hash routing and six module routes.
- DevTools page that registers the DevLens Network panel.
- Network panel shell with inspected-tab context and a clear empty state.
- Typed runtime messaging with a ping handler and page-metadata contract.
- `chrome.storage.local` wrapper with a development fallback and settings
  defaults.
- Tailwind CSS 4 design system with dark theme tokens, shared components, and
  inline SVG icons.
- Generated PNG extension icons and a validated Manifest V3 configuration.
- Vitest setup covering routing, messaging, storage, components, and the
  manifest contract.
- Two-pass build with post-build artifact verification.
- README, architecture, roadmap, agent instructions, and this changelog.

### Notes

- Feature modules are explicitly scaffolded; network capture, JSON, JWT, API
  requests, Ollama, and Page Inspector are not implemented yet.
- The content script is built but not registered in the manifest to avoid host
  access before Page Inspector ships.
- Supported browsers: Brave, Google Chrome, and Microsoft Edge. Firefox is not
  supported in this release.
