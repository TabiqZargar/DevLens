import type { LocalAiModel } from "./provider";

export const OLLAMA_DEFAULT_TIMEOUT_MS = 5_000;
export const OLLAMA_MAX_RESPONSE_BYTES = 1024 * 1024;
export const OLLAMA_CHAT_TIMEOUT_MS = 120_000;
export const OLLAMA_CHAT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export type OllamaEndpointValidation =
  | {
      ok: true;
      endpoint: string;
      origin: string;
    }
  | {
      ok: false;
      message: string;
    };

function invalid(message: string): OllamaEndpointValidation {
  return { ok: false, message };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

export function validateOllamaEndpoint(
  input: string,
): OllamaEndpointValidation {
  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return invalid("Enter a local Ollama endpoint.");
  }

  let parsed: URL;

  try {
    parsed = new URL(trimmed);
  } catch {
    return invalid(
      "Enter a valid URL such as http://127.0.0.1:11434.",
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return invalid("Use an http:// or https:// endpoint.");
  }

  if (parsed.username.length > 0 || parsed.password.length > 0) {
    return invalid("Do not include credentials in the endpoint.");
  }

  if (!LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) {
    return invalid(
      "Only loopback endpoints on localhost, 127.0.0.1, or [::1] are allowed.",
    );
  }

  if (
    parsed.pathname !== "/" ||
    parsed.search.length > 0 ||
    parsed.hash.length > 0
  ) {
    return invalid(
      "Use the Ollama base URL without a path, query, or fragment.",
    );
  }

  const endpoint = `${parsed.protocol}//${parsed.host}`;

  return { ok: true, endpoint, origin: endpoint };
}

export function parseOllamaTags(
  value: unknown,
): LocalAiModel[] | null {
  const record = asRecord(value);

  if (!record || !Array.isArray(record.models)) {
    return null;
  }

  const models: LocalAiModel[] = [];
  const seen = new Set<string>();

  for (const entry of record.models) {
    const item = asRecord(entry);

    if (!item) {
      return null;
    }

    const rawName = item.name;

    if (typeof rawName !== "string" || rawName.trim().length === 0) {
      return null;
    }

    const name = rawName.trim();

    if (seen.has(name)) {
      continue;
    }

    seen.add(name);

    const model: LocalAiModel = { name };

    if (
      typeof item.size === "number" &&
      Number.isFinite(item.size) &&
      item.size >= 0
    ) {
      model.sizeBytes = item.size;
    }

    if (
      typeof item.modified_at === "string" &&
      item.modified_at.length > 0
    ) {
      model.modifiedAt = item.modified_at;
    }

    const details = asRecord(item.details);

    if (details) {
      if (
        typeof details.parameter_size === "string" &&
        details.parameter_size.length > 0
      ) {
        model.parameterSize = details.parameter_size;
      }

      if (
        typeof details.quantization_level === "string" &&
        details.quantization_level.length > 0
      ) {
        model.quantizationLevel = details.quantization_level;
      }
    }

    models.push(model);
  }

  return models;
}
