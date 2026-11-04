# Architecture

## Goals

DevLens is a local-first, Chromium-targeted developer toolkit. The foundation
must make feature work independent, keep permissions minimal, and preserve a
single build that loads in Brave, Chrome, and Edge.

Constraints:

- Manifest V3 only
- Strict TypeScript
- No backend, cloud AI, analytics, or telemetry
- No unnecessary dependencies or permissions
- No fake network data or believable placeholder functionality

## Runtime contexts

```text
Toolbar ──▶ popup.html ──openWorkspace()──▶ workspace.html#/<module>
                                              │
                                              ├─ src/features/<module>
                                              ├─ src/components
                                              ├─ src/services
                                              └─ new Worker(json-worker)
                                                   └─ parse/format/minify/validate

DevTools (F12)
  └─ devtools.html (registers panel)
       └─ panel.html  (Network Inspector UI)
            └─ chrome.devtools.inspectedWindow

background.js (MV3 service worker)
  └─ typed runtime messages

content.js (built, not registered)
  └─ page metadata request handler, ready for Page Inspector
```

### Popup

`src/popup` is a compact launcher (380 px). It lists all modules, opens the
workspace at a hash route, and pings the service worker to show a real
connection state. It does not hold feature state.

### Workspace

`src/workspace` is the full-page application shell. Routes are
`#/<moduleId>`; unknown routes fall back to `json`. `src/shared/modules.ts` is
the source of module metadata, and `src/features/registry.ts` maps module ids to
screens. Navigation updates the hash; the shell resets the `<main>` scroll
container on route changes.

### JSON Studio

`src/features/json` owns the first fully functional module. `json-core.ts` is a
pure, deterministic processing layer shared by the worker and the synchronous
fallback: it parses, formats, minifies, validates, describes errors, computes
tree summaries, and dispatches actions. It has no Chrome, DOM, storage, network,
or `eval` dependency.

`json-worker.ts` receives `{ id, action, input, indent }` messages and returns
typed results through `json-worker-protocol.ts`. `json-worker-client.ts` creates
a module worker from the hashed Vite asset, tracks request ids, rejects stale
responses, and falls back to synchronous processing when `Worker` is unavailable
or worker construction fails. The screen never persists input or output.

`JsonStudioScreen.tsx` composes the action bar, input/output editors, notices,
and tree. `json-editor.tsx` wraps CodeMirror 6 with a dark theme and exposes
`focus`/`reveal` for error jumps. `json-tree.tsx` renders typed, collapsible
nodes and bounds each container to 100 visible children and 40 depth levels.

### DevTools

`devtools.html` runs `src/devtools/index.ts`, which calls
`chrome.devtools.panels.create(...)`. The panel itself is `panel.html`, backed by
`src/devtools/panel`. The panel reads `chrome.devtools.inspectedWindow.tabId` so
future network capture can target the inspected tab. No permission is required
for these APIs beyond `devtools_page` in the manifest.

### Background

`src/background/index.ts` registers a runtime message listener and delegates to
`message-handler.ts`. The worker contains no React or DOM code. It must remain
usable where `window` and `localStorage` do not exist.

### Content script

`src/content/index.ts` answers `devlens:page-metadata` with the page title, URL,
and capture time. It is built as a self-contained classic IIFE but is
intentionally **not registered** in the manifest yet. Registering it now would
grant access to every HTTP(S) page before Page Inspector exists. When that
milestone lands, prefer on-demand injection (`activeTab` + `scripting`) or a
narrow host list, then document the permission change.

## Build pipeline

`npm run build` runs, in order:

1. `tsc --noEmit`
2. `vite build` for `popup.html`, `workspace.html`, `devtools.html`, `panel.html`
3. `node scripts/build-scripts.mjs` for `background.js` and `content.js`
4. `node scripts/verify-build.mjs`

The page build uses `emptyOutDir: true` and emits hashed page assets, including
`json-worker-[hash].js` from the JSON Studio worker graph. `vite.config.ts` sets
`worker.format: "es"`; the workspace loads the worker through
`new URL(..., import.meta.url)`, so the hashed filename is resolved at runtime.
The worker build uses `emptyOutDir: false`, so it must run second. Both worker
entries are built through Vite's JavaScript API with `configFile: false` and
`codeSplitting: false` so each output stays a single file. The background is an
ES module; the content script is an IIFE because MV3 content scripts are
classic scripts and cannot import modules.

`public/` is copied by the page build. `public/manifest.json` references the
generated `background.js`; `content.js` is built and verifier-checked but is not
yet referenced by the manifest. Renaming either worker requires updating
`scripts/build-scripts.mjs` and `scripts/verify-build.mjs`, plus the manifest for
any file it references.

`scripts/verify-build.mjs` parses `dist/manifest.json` and checks every page,
worker, content script, and icon it references. `dist/` is generated and is not
committed.

## Messaging and storage

`src/shared/messaging.ts` owns request/response types and guards. The background
responds to `devlens:ping`; content responds to `devlens:page-metadata`.
`src/services/messaging.ts` wraps `chrome.runtime.sendMessage` and converts
delivery failures into a structured `{ ok: false, error }` result.

`src/services/storage.ts` wraps `chrome.storage.local` and falls back to
`window.localStorage` when running under the Vite dev server. It guards both
APIs, so the same module can be imported by extension pages and tests. Settings
live under the `devlens:settings` key.

## Permissions and cross-browser support

Current permissions: `storage` only.

- `chrome.tabs.create` for opening the workspace does not require `tabs`.
- DevTools panels require only the `devtools_page` manifest key.
- The content script is built but not registered, so no host access is granted.
- Future API Builder requests will need optional host permissions, requested
  only when a user sends to a new origin.
- Future Page Inspector work should use `activeTab` or a user-triggered injection
  path rather than broad always-on host access.

Chrome, Edge, and Brave all implement MV3 and the `chrome.*` namespace, so the
same `dist/` is loadable in each. Firefox is out of scope: it needs a different
manifest and `browser.*`/promise behavior. `minimum_chrome_version` is `116`.

## Design system

Tailwind v4 is configured entirely in CSS (`src/styles/index.css`); there is no
`tailwind.config.*`. Theme tokens are exposed through `@theme` and consumed as
normal utilities (`bg-surface`, `text-muted`, `border-line`, `text-accent`).
Shared primitives live in `src/components` and use the `cn` helper.

The visual language is a premium dark surface: near-black canvas, layered
panels, violet/cyan accents, subtle grid and radial glows, and system font
stacks. Icons are inline SVG in `src/components/icons.tsx`. MV3 CSP forbids
remote assets, so there are no external fonts, images, or icon libraries.

## Testing

Vitest runs two projects:

- `node` for pure logic (`src/shared`, `src/background`, `json-core`, manifest
  contract)
- `dom` with jsdom for components, storage, and the JSON tree/editor screen

`src/test/setup.ts` installs jest-dom matchers and RTL cleanup. Tests mock
`chrome` with `vi.stubGlobal`. CodeMirror renders under jsdom; editor
integration tests use `EditorView.findFromDOM` to dispatch changes. The manifest
test enforces MV3, minimal permissions, version alignment with `package.json`,
and presence of declared icons. The build verifier covers generated artifacts
that do not exist until `npm run build`.

## Decisions and trade-offs

- **Hash routing instead of React Router.** One route dimension, no dependency.
- **No state library.** The foundation has no cross-feature state yet.
- **CodeMirror 6 for JSON editing.** Only the editor, JSON language, state, and
  view packages are installed. No editor framework wrapper is used.
- **Pure processing core plus worker.** `json-core.ts` is shared by the worker
  and a synchronous fallback, so behavior stays testable and identical without
  a worker. Parse/format/minify/validate stay off the main thread in the built
  extension.
- **No JSON persistence.** Input, output, tree state, and errors live in memory
  only for the active screen; clearing and route changes discard them.
- **No Ollama SDK.** The future integration is a small `fetch` client against a
  configurable localhost endpoint.
- **Static manifest, no manifest plugin.** It is small and verifier-checked.
- **Deferred content-script registration.** Keeps the install prompt honest.

## Adding a module

1. Add metadata and a `ModuleId` in `src/shared/modules.ts`.
2. Create `src/features/<id>/<Name>Screen.tsx`.
3. Register the screen in `src/features/registry.ts`.
4. Add a test for routing/metadata if behavior changes.
5. Update `README.md` and `docs/ROADMAP.md`.
