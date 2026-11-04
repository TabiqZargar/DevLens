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

### Changed

- Added minimal CodeMirror 6 dependencies and `worker.format: "es"` to Vite.
- Updated module metadata, README, architecture, roadmap, and agent
  instructions for the functional JSON Studio.

### Notes

- JSON input, output, tree state, and errors stay in memory for the active
  screen. There is no persistence, history, telemetry, or network request.
- The tree renders at most 100 children per container and 40 depth levels.
- Automated tests, typecheck, build, and verification pass. The manual
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
