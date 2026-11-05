# DevLens

DevLens is a local-first developer toolkit that runs as a Manifest V3 browser
extension in Brave, Chrome, and Edge. It is designed for inspecting, shaping,
and testing web APIs without sending developer data to a backend.

This repository ships the extension foundation plus **JSON Studio** and
**JWT Inspector**, the first fully functional modules. JSON is formatted,
minified, validated, and explored entirely on-device, and JWTs are decoded and
inspected without verification or network access. Neither feature uploads or
persists developer data. Network capture, the API builder, Ollama, and Page
Inspector remain scaffolded.

## Stack

| Layer      | Choice                                         |
| ---------- | ---------------------------------------------- |
| UI         | React 19, TypeScript 7 (strict), Tailwind CSS 4 |
| Editor     | CodeMirror 6 (`@codemirror/lang-json`)          |
| Build      | Vite 8 (Rolldown), Manifest V3                 |
| Tests      | Vitest 5, Testing Library, jsdom               |
| Platform   | Chromium extensions (`chrome.*` APIs)          |
| Local AI   | Ollama over HTTP (planned, no SDK)             |

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
- Full workspace shell with six module routes; JSON Studio and JWT Inspector
  are functional and the remaining modules are explicit scaffolds
- JSON Studio with a CodeMirror 6 editor, format, minify, validate, indentation,
  copy, swap, and clear actions
- Worker-backed JSON parsing with a synchronous fallback for environments
  without `Worker`
- Collapsible typed JSON tree with node/depth stats and bounded rendering
- JWT Inspector with local header/payload/signature decoding, registered-claim
  inspection, lifetime warnings, and explicit unverified-signature messaging
- DevTools panel registration and inspected-tab context
- Typed background messaging and page-metadata contract
- Storage wrapper with a dev fallback outside extensions
- Premium dark design system, responsive layout, and inline icon set
- Tests plus a post-build artifact verifier

Not implemented yet:

- Network capture
- JWT signature verification
- API request sending or collections
- Ollama integration
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

## Cross-browser notes

Chrome, Edge, and Brave share the same Chromium extension platform and load the
same `dist/` output. The code uses the `chrome.*` namespace, which all three
provide. `minimum_chrome_version` is `116`. Firefox is not currently supported.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Changelog](CHANGELOG.md)
- [Agent instructions](AGENTS.md)
