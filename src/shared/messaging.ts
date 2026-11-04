export interface PingPayload {
  service: "background";
  timestamp: string;
}

export interface PageMetadata {
  title: string;
  url: string;
  capturedAt: string;
}

export type RuntimeRequest = {
  type: "devlens:ping";
};

export type PageMetadataRequest = {
  type: "devlens:page-metadata";
};

export type RuntimeResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type PingResponse = RuntimeResponse<PingPayload>;
export type PageMetadataResponse = RuntimeResponse<PageMetadata>;

export function isRuntimeRequest(value: unknown): value is RuntimeRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "devlens:ping"
  );
}

export function isPageMetadataRequest(
  value: unknown,
): value is PageMetadataRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "devlens:page-metadata"
  );
}
