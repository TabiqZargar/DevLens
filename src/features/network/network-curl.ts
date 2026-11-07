import type { NetworkEntry, NetworkPostData } from "./network-model";

export type CurlCommandResult =
  | { ok: true; command: string }
  | { ok: false; reason: "missing-url" };

function quoteShell(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function hasHeader(
  headers: readonly { name: string }[],
  name: string,
): boolean {
  const target = name.toLowerCase();

  return headers.some(
    (header) => header.name.toLowerCase() === target,
  );
}

function buildUrl(entry: NetworkEntry): string | null {
  if (entry.url.length === 0) return null;
  if (entry.queryParams.length === 0) return entry.url;

  try {
    const url = new URL(entry.url);

    if (url.search.length > 0) return entry.url;

    for (const param of entry.queryParams) {
      url.searchParams.append(param.name, param.value);
    }

    return url.toString();
  } catch {
    return entry.url;
  }
}

function getPostDataText(postData: NetworkPostData | null): string | null {
  if (postData === null) return null;
  if (postData.text !== null) return postData.text;
  if (postData.params.length === 0) return null;
  if (
    postData.params.some((param) => param.fileName !== null)
  ) {
    return null;
  }

  return postData.params
    .map(
      (param) =>
        `${encodeURIComponent(param.name)}=${encodeURIComponent(param.value)}`,
    )
    .join("&");
}

export function createCurlCommand(
  entry: NetworkEntry,
): CurlCommandResult {
  const url = buildUrl(entry);

  if (url === null) {
    return { ok: false, reason: "missing-url" };
  }

  const parts = ["curl"];

  if (entry.method.length > 0) {
    parts.push("--request", quoteShell(entry.method));
  }

  parts.push(quoteShell(url));

  for (const header of entry.requestHeaders) {
    parts.push(
      "--header",
      quoteShell(`${header.name}: ${header.value}`),
    );
  }

  if (
    entry.postData !== null &&
    entry.postData.mimeType.length > 0 &&
    !hasHeader(entry.requestHeaders, "content-type")
  ) {
    parts.push(
      "--header",
      quoteShell(`Content-Type: ${entry.postData.mimeType}`),
    );
  }

  const body = getPostDataText(entry.postData);

  if (body !== null && body.length > 0) {
    parts.push("--data-raw", quoteShell(body));
  }

  return { ok: true, command: parts.join(" ") };
}
