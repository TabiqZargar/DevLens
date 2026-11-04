import { access, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const dist = resolve(import.meta.dirname, "../dist");
const failures = [];

async function requireFile(relativePath) {
  try {
    await access(resolve(dist, relativePath));
  } catch {
    failures.push(`missing artifact: dist/${relativePath}`);
  }
}

let manifest;
try {
  manifest = JSON.parse(await readFile(resolve(dist, "manifest.json"), "utf8"));
} catch {
  console.error("Build verification failed: dist/manifest.json is missing or invalid.");
  process.exit(1);
}

if (manifest.manifest_version !== 3) {
  failures.push("manifest_version must be 3");
}

if (manifest.background?.type !== "module") {
  failures.push("background service worker must be an ES module");
}

const referencedFiles = [
  manifest.action?.default_popup,
  manifest.devtools_page,
  manifest.background?.service_worker,
  ...(manifest.content_scripts ?? []).flatMap((script) => script.js ?? []),
  ...Object.values(manifest.icons ?? {}),
  ...Object.values(manifest.action?.default_icon ?? {}),
].filter(Boolean);

const requiredFiles = new Set([
  ...referencedFiles,
  "popup.html",
  "workspace.html",
  "devtools.html",
  "panel.html",
  "background.js",
  "content.js",
]);

for (const file of requiredFiles) {
  await requireFile(file);
}

let jsonWorkerPresent = false;
try {
  const assets = await readdir(resolve(dist, "assets"));
  jsonWorkerPresent = assets.some((file) =>
    /^json-worker-[A-Za-z0-9_-]+\.js$/.test(file),
  );
} catch {
  failures.push("missing artifact directory: dist/assets");
}

if (!jsonWorkerPresent) {
  failures.push("missing artifact: dist/assets/json-worker-<hash>.js");
}

if (failures.length > 0) {
  console.error("Build verification failed:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Build verified: ${requiredFiles.size} required artifacts and the JSON worker are present.`,
  );
}
