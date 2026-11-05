# AGENTS.md

## Repository state

- Project root: `Desktop/DevLens`. The Git root is `/mnt/c/Users/tabiq` (the Windows home directory), not this folder, and it has no commits.
- Never run `git add -A`, `git reset`, force-push, or commit from the home repo. If asked to commit, stage explicit paths under `Desktop/DevLens` only.
- Use npm (Node >= 22.12; developed on Node 24.21 / npm 11.19). `package-lock.json` is authoritative; do not switch package managers.
- JSON Studio, JWT Inspector, the API Builder request editor (Stage 3A), and
  background request execution (Stage 3B-2) are implemented and tested; the API
  Send/response UI remains unwired. Network capture, collections, Ollama, and
  Page Inspector remain scaffolds unless their milestone is explicitly
  requested. Treat JSON Studio as the reference feature.

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
- CodeMirror 6 owns the JSON editor. Keep the package set minimal (`@codemirror/{state,view,commands,language,lang-json}` plus `@lezer/highlight`); do not add editor wrappers or UI libraries.
- The content script builds but is intentionally not registered in the manifest, to avoid host access. Register it only when Page Inspector needs it, and update docs/permissions.
- `src/shared/modules.ts` owns module metadata and hash routing; `src/features/registry.ts` maps ids to screens. Add a module in both.
- Workspace routes are `#/<moduleId>`; unknown routes fall back to `json`. Popup opens the workspace with `openWorkspace()`.
- `src/shared` is pure types/constants. `src/services` wraps chrome APIs. `src/components` is shared UI. Feature logic belongs in `src/features/<module>/`.

## Conventions and constraints

- Tailwind v4 is CSS-first: tokens and base styles live in `src/styles/index.css`; there is no `tailwind.config.*`. Use the existing `cn` helper and components.
- No icon, font, or animation libraries. Icons are inline SVG in `src/components/icons.tsx`; fonts are system stacks (MV3 CSP allows no remote assets). CodeMirror is the only editor dependency.
- Active permissions are intentionally minimal (`storage` only).
  `optional_host_permissions` declares HTTP(S) origins for user-initiated API
  sends. Do not add permissions or host access without updating
  `manifest.json`, `docs/ARCHITECTURE.md`, and tests.
- Version lives in both `package.json` and `public/manifest.json`; `src/manifest.test.ts` fails if they drift.
- Strict TS uses `noUncheckedIndexedAccess` and `verbatimModuleSyntax`; use `import type` for type-only imports.
- No fake data or believable placeholder UI. Unshipped module screens stay explicitly labelled scaffolds until their milestone lands; JSON Studio, JWT Inspector, and the API request editor are functional exceptions.
- Tests run in two Vitest projects: `node` for pure logic (including `json-core`), `dom` (jsdom) for components/storage and the JSON tree/screen. Mock `chrome` with `vi.stubGlobal`; cleanup is in `src/test/setup.ts`.

## Gotchas

- `dist/` is generated; never edit or commit it.
- There is no HMR inside the extension. After `npm run build`, reload the unpacked extension (and refresh the inspected page) to pick up changes.
- Vite 8 uses Rolldown: use `codeSplitting: false` for single-file bundles; `inlineDynamicImports` is deprecated. The JSON worker relies on `worker.format: "es"` and a runtime `new URL(..., import.meta.url)`.
- MV3 service workers cannot use `window`/`localStorage`; storage code must continue to guard for that.
- The workspace scroll container is `<main>`, not the window; reset its scroll when route changes.
- CodeMirror 6 renders under jsdom. In editor integration tests, use `EditorView.findFromDOM(element)` and dispatch changes inside `act`; do not synthesize DOM text mutations.

## Docs

`README.md` (setup/load), `docs/ARCHITECTURE.md` (runtime model/decisions), `docs/ROADMAP.md` (milestones), `CHANGELOG.md`.
