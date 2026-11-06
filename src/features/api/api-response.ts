import { formatJson } from "../json/json-core";

export type ResponseBodyView =
  | { kind: "empty" }
  | { kind: "json"; text: string }
  | { kind: "text"; text: string; note: string | null };

export function isJsonContentType(contentType: string | null): boolean {
  if (contentType === null) return false;

  const mediaType =
    contentType.split(";")[0]?.trim().toLowerCase() ?? "";

  return (
    mediaType === "application/json" ||
    mediaType === "text/json" ||
    mediaType.endsWith("+json")
  );
}

export function buildResponseBodyView(
  body: string,
  contentType: string | null,
): ResponseBodyView {
  if (body.trim().length === 0) {
    return { kind: "empty" };
  }

  if (!isJsonContentType(contentType)) {
    return { kind: "text", text: body, note: null };
  }

  const formatted = formatJson(body);

  if (formatted.ok && formatted.output !== null) {
    return { kind: "json", text: formatted.output };
  }

  return {
    kind: "text",
    text: body,
    note: "Showing raw text because the body is not valid JSON.",
  };
}

export function formatResponseStatus(
  status: number,
  statusText: string,
): string {
  const trimmed = statusText.trim();
  return trimmed.length > 0 ? `${status} ${trimmed}` : `${status}`;
}

export function responseStatusVariant(
  status: number,
): "success" | "warning" | "neutral" {
  if (status >= 200 && status < 300) return "success";
  if (status >= 400) return "warning";
  return "neutral";
}
