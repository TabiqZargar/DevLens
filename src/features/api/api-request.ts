export const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

export const BODY_CONTENT_TYPES = [
  "none",
  "application/json",
  "text/plain",
  "application/x-www-form-urlencoded",
] as const;

export type BodyContentType = (typeof BODY_CONTENT_TYPES)[number];

export interface KeyValueRow {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export type KeyValueRowPatch = Partial<
  Pick<KeyValueRow, "key" | "value" | "enabled">
>;

export interface RequestBodyDraft {
  contentType: BodyContentType;
  content: string;
}

export interface ApiRequestDraft {
  method: HttpMethod;
  url: string;
  params: KeyValueRow[];
  headers: KeyValueRow[];
  body: RequestBodyDraft;
}

export interface NormalizedRow {
  key: string;
  value: string;
}

export type UrlValidation =
  | { ok: true; url: URL }
  | { ok: false; message: string };

let rowSequence = 0;

function nextRowId(): string {
  rowSequence += 1;
  return `row-${rowSequence}`;
}

export function createRow(
  values: Partial<Omit<KeyValueRow, "id">> = {},
): KeyValueRow {
  return {
    id: nextRowId(),
    key: values.key ?? "",
    value: values.value ?? "",
    enabled: values.enabled ?? true,
  };
}

export function createRequestDraft(): ApiRequestDraft {
  return {
    method: "GET",
    url: "",
    params: [createRow()],
    headers: [createRow()],
    body: { contentType: "none", content: "" },
  };
}

export function isHttpMethod(value: string): value is HttpMethod {
  return (HTTP_METHODS as readonly string[]).includes(value);
}

export function isBodyContentType(
  value: string,
): value is BodyContentType {
  return (BODY_CONTENT_TYPES as readonly string[]).includes(value);
}

export function appendRow(
  rows: readonly KeyValueRow[],
): KeyValueRow[] {
  return [...rows, createRow()];
}

export function updateRow(
  rows: readonly KeyValueRow[],
  id: string,
  patch: KeyValueRowPatch,
): KeyValueRow[] {
  return rows.map((row) =>
    row.id === id ? { ...row, ...patch } : row,
  );
}

export function removeRow(
  rows: readonly KeyValueRow[],
  id: string,
): KeyValueRow[] {
  return rows.filter((row) => row.id !== id);
}

export function normalizeRows(
  rows: readonly KeyValueRow[],
): NormalizedRow[] {
  return rows
    .filter((row) => row.enabled && row.key.trim().length > 0)
    .map((row) => ({ key: row.key.trim(), value: row.value }));
}

export function countEnabledRows(
  rows: readonly KeyValueRow[],
): number {
  return rows.filter(
    (row) => row.enabled && row.key.trim().length > 0,
  ).length;
}

export function buildQueryString(
  rows: readonly KeyValueRow[],
): string {
  const search = new URLSearchParams();

  for (const row of normalizeRows(rows)) {
    search.append(row.key, row.value);
  }

  const value = search.toString();
  return value.length > 0 ? `?${value}` : "";
}

export function validateRequestUrl(value: string): UrlValidation {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return {
      ok: false,
      message: "Enter a request URL.",
    };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return {
      ok: false,
      message:
        "Enter a valid absolute URL, including http:// or https://.",
    };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      ok: false,
      message: "Only http:// and https:// URLs are supported.",
    };
  }

  return { ok: true, url };
}

export function isDraftEmpty(draft: ApiRequestDraft): boolean {
  const hasRows = (rows: readonly KeyValueRow[]) =>
    rows.some(
      (row) =>
        row.key.trim().length > 0 || row.value.trim().length > 0,
    );

  return (
    draft.method === "GET" &&
    draft.url.trim().length === 0 &&
    !hasRows(draft.params) &&
    !hasRows(draft.headers) &&
    draft.body.contentType === "none" &&
    draft.body.content.trim().length === 0
  );
}
