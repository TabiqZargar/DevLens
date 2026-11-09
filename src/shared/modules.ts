export type ModuleId = "network" | "json" | "jwt" | "api" | "ai" | "page";

export type ModuleSurface = "workspace" | "devtools";

export interface ModuleDefinition {
  id: ModuleId;
  name: string;
  tagline: string;
  description: string;
  milestone: string;
  surface: ModuleSurface;
}

export const MODULES: readonly ModuleDefinition[] = [
  {
    id: "network",
    name: "Network Inspector",
    tagline: "See every request in context.",
    description:
      "Capture and inspect fetch, XHR, and document requests from a dedicated DevTools panel without leaving the page.",
    milestone: "Milestone 1",
    surface: "devtools",
  },
  {
    id: "json",
    name: "JSON Studio",
    tagline: "Shape payloads without the friction.",
    description:
      "Format, minify, validate, and explore JSON payloads in a fast local editor built for large responses.",
    milestone: "Milestone 2",
    surface: "workspace",
  },
  {
    id: "jwt",
    name: "JWT Inspector",
    tagline: "Understand tokens at a glance.",
    description:
      "Decode headers and claims, surface expiry and clock warnings, and keep secrets on this device.",
    milestone: "Milestone 2",
    surface: "workspace",
  },
  {
    id: "api",
    name: "API Builder",
    tagline: "Compose, send, and replay requests.",
    description:
      "Build requests with headers, auth, and bodies, then keep reusable collections in local storage.",
    milestone: "Milestone 3",
    surface: "workspace",
  },
  {
    id: "ai",
    name: "Local AI Assistant",
    tagline: "Ask, review, and debug code without leaving your machine.",
    description:
      "Chat with installed Ollama models and explicitly attach code or errors. No cloud provider, saved conversations, or telemetry.",
    milestone: "Milestone 4",
    surface: "workspace",
  },
  {
    id: "page",
    name: "Page Inspector",
    tagline: "Understand the page behind the request.",
    description:
      "Inspect page metadata, assets, and accessibility signals through a narrowly scoped content script.",
    milestone: "Milestone 5",
    surface: "workspace",
  },
];

export const DEFAULT_MODULE_ID: ModuleId = "json";

export function isModuleId(value: string): value is ModuleId {
  return MODULES.some((module) => module.id === value);
}

export function moduleFromHash(hash: string): ModuleId {
  const route = hash.replace(/^#\/?/, "").split(/[/?]/, 1)[0] ?? "";
  return isModuleId(route) ? route : DEFAULT_MODULE_ID;
}

export function getModuleDefinition(id: ModuleId): ModuleDefinition {
  const definition = MODULES.find((module) => module.id === id);
  if (!definition) {
    throw new Error(`Unknown module: ${id}`);
  }
  return definition;
}
