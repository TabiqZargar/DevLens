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

## Milestone 2 — JSON Studio (implemented) and JWT Inspector (planned)

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

- Decode JWT header/payload, explain claims, and warn on `exp`/`nbf`/`iat`.
- Optional local signature verification; never transmit tokens.

Acceptance: JWT claims and expiry states are correct against fixtures.

## Milestone 3 — API Builder

- Request editor for method, URL, query, headers, auth, and body.
- Send through the background worker with timeout and cancellation.
- Request optional host permissions per origin at send time.
- Save collections and environments in `chrome.storage.local`.
- Copy as cURL/fetch; replay history.

Acceptance: requests work across origins only after explicit permission; secrets
are never synced; permission denial produces an actionable error.

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
