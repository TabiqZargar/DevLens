import { describe, expect, it } from "vitest";
import {
  formatDuration,
  inspectClaims,
  type ClaimInsight,
  type JwtClaimReport,
  type RegisteredClaimName,
} from "./jwt-claims";
import type { JwtJsonObject } from "./jwt-core";

const NOW_SECONDS = 1_700_000_000;
const NOW = NOW_SECONDS * 1000;

function claim(
  report: JwtClaimReport,
  name: RegisteredClaimName,
): ClaimInsight {
  const found = report.claims.find((entry) => entry.name === name);

  if (!found) {
    throw new Error(`Missing claim insight for ${name}.`);
  }

  return found;
}

function payload(overrides: JwtJsonObject = {}): JwtJsonObject {
  return {
    exp: NOW_SECONDS + 3_600,
    iat: NOW_SECONDS - 60,
    nbf: NOW_SECONDS - 60,
    iss: "https://issuer.example",
    sub: "user-1",
    aud: ["api", "web"],
    jti: "id-1",
    ...overrides,
  };
}

describe("JWT claim inspection", () => {
  it("classifies standard claims", () => {
    const report = inspectClaims(payload(), NOW);

    expect(report.claims).toHaveLength(7);
    expect(report.hasExpiry).toBe(true);
    expect(report.hasNotBefore).toBe(true);
    expect(report.hasIssuedAt).toBe(true);
    expect(report.expired).toBe(false);
    expect(report.notYetValid).toBe(false);
    expect(report.issuedInFuture).toBe(false);
    expect(report.nonStandard).toBe(false);

    const exp = claim(report, "exp");
    expect(exp).toMatchObject({
      present: true,
      kind: "numeric-date",
      status: "active",
      relative: "Expires in 1h",
      dateMs: (NOW_SECONDS + 3_600) * 1000,
      dateIso: new Date((NOW_SECONDS + 3_600) * 1000).toISOString(),
    });

    const iat = claim(report, "iat");
    expect(iat).toMatchObject({
      kind: "numeric-date",
      status: "active",
      relative: "Issued 1m ago",
    });

    const nbf = claim(report, "nbf");
    expect(nbf).toMatchObject({
      kind: "numeric-date",
      status: "active",
      relative: "Not-before time passed",
    });

    expect(claim(report, "iss").kind).toBe("text");
    expect(claim(report, "iss").status).toBe("present");
    expect(claim(report, "sub").kind).toBe("text");
    expect(claim(report, "jti").kind).toBe("text");
    expect(claim(report, "aud").kind).toBe("audience");
    expect(claim(report, "aud").status).toBe("present");
  });

  it("marks expired tokens using an injectable clock", () => {
    const report = inspectClaims(
      payload({ exp: NOW_SECONDS - 5 }),
      NOW,
    );

    expect(claim(report, "exp")).toMatchObject({
      status: "expired",
      relative: "Expired 5s ago",
    });
    expect(report.expired).toBe(true);
    expect(report.hasExpiry).toBe(true);
  });

  it("marks tokens whose not-before time is in the future", () => {
    const report = inspectClaims(
      payload({ nbf: NOW_SECONDS + 120 }),
      NOW,
    );

    expect(claim(report, "nbf")).toMatchObject({
      status: "not-yet-valid",
      relative: "Not before in 2m",
    });
    expect(report.notYetValid).toBe(true);
  });

  it("marks tokens issued in the future", () => {
    const report = inspectClaims(
      payload({ iat: NOW_SECONDS + 90 }),
      NOW,
    );

    expect(claim(report, "iat")).toMatchObject({
      status: "future-issued",
      relative: "Issued 1m 30s in the future",
    });
    expect(report.issuedInFuture).toBe(true);
  });

  it("handles boundary times precisely", () => {
    const report = inspectClaims(
      {
        exp: NOW_SECONDS,
        nbf: NOW_SECONDS,
        iat: NOW_SECONDS,
      },
      NOW,
    );

    expect(claim(report, "exp").status).toBe("expired");
    expect(claim(report, "nbf").status).toBe("active");
    expect(claim(report, "iat").status).toBe("active");
    expect(report.expired).toBe(true);
    expect(report.notYetValid).toBe(false);
    expect(report.issuedInFuture).toBe(false);
  });

  it("reports missing registered claims as missing", () => {
    const report = inspectClaims({}, NOW);

    expect(report.claims).toHaveLength(7);
    expect(report.hasExpiry).toBe(false);
    expect(report.hasNotBefore).toBe(false);
    expect(report.hasIssuedAt).toBe(false);
    expect(report.expired).toBe(false);
    expect(report.notYetValid).toBe(false);
    expect(report.issuedInFuture).toBe(false);
    expect(report.nonStandard).toBe(false);

    for (const insight of report.claims) {
      expect(insight).toMatchObject({
        present: false,
        value: null,
        kind: "missing",
        raw: "Not present",
        dateMs: null,
        dateIso: null,
        relative: null,
        status: "missing",
      });
    }
  });

  it("flags non-standard values without hiding them", () => {
    const report = inspectClaims(
      {
        exp: "tomorrow",
        iat: null,
        nbf: Number.NaN,
        iss: 42,
        sub: ["user"],
        aud: 7,
        jti: false,
      },
      NOW,
    );

    expect(report.nonStandard).toBe(true);
    expect(report.hasExpiry).toBe(true);
    expect(report.hasNotBefore).toBe(true);
    expect(report.hasIssuedAt).toBe(true);

    for (const insight of report.claims) {
      expect(insight.present).toBe(true);
      expect(insight.kind).toBe("non-standard");
      expect(insight.status).toBe("non-standard");
      expect(insight.raw).not.toBe("Not present");
    }

    expect(claim(report, "exp").raw).toBe('"tomorrow"');
    expect(claim(report, "iat").raw).toBe("null");
    expect(claim(report, "nbf").raw).toBe("null");
  });

  it("accepts string and string-array audiences", () => {
    const single = inspectClaims({ aud: "api" }, NOW);
    const multiple = inspectClaims({ aud: ["api", "web"] }, NOW);

    expect(claim(single, "aud")).toMatchObject({
      kind: "audience",
      status: "present",
      raw: '"api"',
    });
    expect(claim(multiple, "aud")).toMatchObject({
      kind: "audience",
      status: "present",
      raw: '["api","web"]',
    });
  });

  it("uses an injectable clock to change expiry over time", () => {
    const exp = NOW_SECONDS + 10;
    const before = inspectClaims({ exp }, NOW);
    const after = inspectClaims({ exp }, NOW + 11_000);

    expect(claim(before, "exp").status).toBe("active");
    expect(claim(after, "exp").status).toBe("expired");
    expect(claim(after, "exp").relative).toBe("Expired 1s ago");
  });
});

describe("formatDuration", () => {
  it("formats readable durations", () => {
    expect(formatDuration(0)).toBe("less than a second");
    expect(formatDuration(999)).toBe("less than a second");
    expect(formatDuration(1_000)).toBe("1s");
    expect(formatDuration(60_000)).toBe("1m");
    expect(formatDuration(61_000)).toBe("1m 1s");
    expect(formatDuration(3_600_000)).toBe("1h");
    expect(formatDuration(3_660_000)).toBe("1h 1m");
    expect(formatDuration(86_400_000)).toBe("1d");
    expect(formatDuration(90_000_000)).toBe("1d 1h");
  });

  it("uses the absolute duration for negative values", () => {
    expect(formatDuration(-61_000)).toBe("1m 1s");
  });
});
