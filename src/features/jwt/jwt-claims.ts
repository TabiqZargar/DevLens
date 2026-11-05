import type { JwtJsonObject, JwtJsonValue } from "./jwt-core";

export const REGISTERED_CLAIM_NAMES = [
  "exp",
  "iat",
  "nbf",
  "iss",
  "sub",
  "aud",
  "jti",
] as const;

export type RegisteredClaimName =
  (typeof REGISTERED_CLAIM_NAMES)[number];

export type ClaimValueKind =
  | "numeric-date"
  | "text"
  | "audience"
  | "non-standard"
  | "missing";

export type ClaimStatus =
  | "expired"
  | "not-yet-valid"
  | "future-issued"
  | "active"
  | "present"
  | "non-standard"
  | "missing";

export interface ClaimInsight {
  name: RegisteredClaimName;
  present: boolean;
  value: JwtJsonValue | null;
  kind: ClaimValueKind;
  raw: string;
  dateMs: number | null;
  dateIso: string | null;
  relative: string | null;
  status: ClaimStatus;
}

export interface JwtClaimReport {
  claims: readonly ClaimInsight[];
  expired: boolean;
  notYetValid: boolean;
  issuedInFuture: boolean;
  hasExpiry: boolean;
  hasNotBefore: boolean;
  hasIssuedAt: boolean;
  nonStandard: boolean;
}

interface NumericDate {
  dateMs: number;
  dateIso: string;
}

function hasOwn(
  object: JwtJsonObject,
  key: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function displayValue(value: JwtJsonValue): string {
  return JSON.stringify(value) ?? String(value);
}

function numericDate(value: JwtJsonValue): NumericDate | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const dateMs = value * 1000;
  const date = new Date(dateMs);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  return {
    dateMs: date.getTime(),
    dateIso: date.toISOString(),
  };
}

function isStringArray(value: JwtJsonValue): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "string")
  );
}

export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(
    0,
    Math.floor(Math.abs(durationMs) / 1000),
  );

  if (totalSeconds < 1) return "less than a second";

  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  if (minutes > 0) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  return `${seconds}s`;
}

function relativeTime(
  name: RegisteredClaimName,
  dateMs: number,
  now: number,
): string | null {
  const difference = dateMs - now;

  if (name === "exp") {
    return difference > 0
      ? `Expires in ${formatDuration(difference)}`
      : `Expired ${formatDuration(difference)} ago`;
  }

  if (name === "nbf") {
    return difference > 0
      ? `Not before in ${formatDuration(difference)}`
      : "Not-before time passed";
  }

  if (name === "iat") {
    return difference > 0
      ? `Issued ${formatDuration(difference)} in the future`
      : `Issued ${formatDuration(difference)} ago`;
  }

  return null;
}

function missingClaim(name: RegisteredClaimName): ClaimInsight {
  return {
    name,
    present: false,
    value: null,
    kind: "missing",
    raw: "Not present",
    dateMs: null,
    dateIso: null,
    relative: null,
    status: "missing",
  };
}

function inspectClaim(
  name: RegisteredClaimName,
  payload: JwtJsonObject,
  now: number,
): ClaimInsight {
  if (!hasOwn(payload, name)) return missingClaim(name);

  const value = payload[name];
  if (value === undefined) return missingClaim(name);

  const raw = displayValue(value);

  if (name === "exp" || name === "iat" || name === "nbf") {
    const date = numericDate(value);
    if (!date) {
      return {
        name,
        present: true,
        value,
        kind: "non-standard",
        raw,
        dateMs: null,
        dateIso: null,
        relative: null,
        status: "non-standard",
      };
    }

    const difference = date.dateMs - now;
    let status: ClaimStatus = "active";

    if (name === "exp" && difference <= 0) {
      status = "expired";
    } else if (name === "nbf" && difference > 0) {
      status = "not-yet-valid";
    } else if (name === "iat" && difference > 0) {
      status = "future-issued";
    }

    return {
      name,
      present: true,
      value,
      kind: "numeric-date",
      raw,
      dateMs: date.dateMs,
      dateIso: date.dateIso,
      relative: relativeTime(name, date.dateMs, now),
      status,
    };
  }

  if (name === "aud") {
    if (typeof value === "string" || isStringArray(value)) {
      return {
        name,
        present: true,
        value,
        kind: "audience",
        raw,
        dateMs: null,
        dateIso: null,
        relative: null,
        status: "present",
      };
    }

    return {
      name,
      present: true,
      value,
      kind: "non-standard",
      raw,
      dateMs: null,
      dateIso: null,
      relative: null,
      status: "non-standard",
    };
  }

  if (typeof value === "string") {
    return {
      name,
      present: true,
      value,
      kind: "text",
      raw,
      dateMs: null,
      dateIso: null,
      relative: null,
      status: "present",
    };
  }

  return {
    name,
    present: true,
    value,
    kind: "non-standard",
    raw,
    dateMs: null,
    dateIso: null,
    relative: null,
    status: "non-standard",
  };
}

export function inspectClaims(
  payload: JwtJsonObject,
  now: number = Date.now(),
): JwtClaimReport {
  const current = Number.isFinite(now) ? now : Date.now();
  const claims = REGISTERED_CLAIM_NAMES.map((name) =>
    inspectClaim(name, payload, current),
  );

  let hasExpiry = false;
  let hasNotBefore = false;
  let hasIssuedAt = false;
  let expired = false;
  let notYetValid = false;
  let issuedInFuture = false;
  let nonStandard = false;

  for (const claim of claims) {
    if (claim.name === "exp") hasExpiry = claim.present;
    if (claim.name === "nbf") hasNotBefore = claim.present;
    if (claim.name === "iat") hasIssuedAt = claim.present;
    if (claim.status === "expired") expired = true;
    if (claim.status === "not-yet-valid") notYetValid = true;
    if (claim.status === "future-issued") issuedInFuture = true;
    if (claim.kind === "non-standard") nonStandard = true;
  }

  return {
    claims,
    expired,
    notYetValid,
    issuedInFuture,
    hasExpiry,
    hasNotBefore,
    hasIssuedAt,
    nonStandard,
  };
}
