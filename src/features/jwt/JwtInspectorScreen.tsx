import { useRef, useState, type ReactNode } from "react";
import {
  Badge,
  Button,
  Card,
  CopyIcon,
  EmptyState,
  KeyIcon,
  Kbd,
  LockIcon,
  Notice,
  PageHeader,
  ScanIcon,
  TrashIcon,
} from "../../components";
import { copyTextToClipboard } from "../../services/clipboard";
import { getModuleDefinition } from "../../shared/modules";
import { JsonCodeEditor } from "../json/json-editor";
import {
  decodeJwt,
  type DecodedJwt,
  type JwtJsonObject,
} from "./jwt-core";
import {
  inspectClaims,
  type ClaimInsight,
  type ClaimStatus,
  type JwtClaimReport,
  type RegisteredClaimName,
} from "./jwt-claims";

const module = getModuleDefinition("jwt");

const CLAIM_LABELS: Record<RegisteredClaimName, string> = {
  exp: "Expiration time",
  iat: "Issued at",
  nbf: "Not before",
  iss: "Issuer",
  sub: "Subject",
  aud: "Audience",
  jti: "JWT ID",
};

const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  expired: "Expired",
  "not-yet-valid": "Not yet valid",
  "future-issued": "Future issued",
  active: "Active",
  present: "Present",
  "non-standard": "Non-standard",
  missing: "Missing",
};

interface DecodedState {
  source: string;
  decoded: DecodedJwt;
  claims: JwtClaimReport;
}

type Notice = {
  kind: "success" | "info" | "warning" | "error";
  message: string;
};

function prettyJson(value: JwtJsonObject): string {
  return JSON.stringify(value, null, 2);
}

function claimBadgeVariant(status: ClaimStatus) {
  if (status === "active") return "success" as const;
  if (
    status === "expired" ||
    status === "not-yet-valid" ||
    status === "future-issued" ||
    status === "non-standard"
  ) {
    return "warning" as const;
  }
  return "outline" as const;
}

function ClaimRow({ claim }: { claim: ClaimInsight }) {
  return (
    <li className="grid gap-3 px-4 py-3 sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-start">
      <div className="min-w-0">
        <code className="font-mono text-xs text-accent-strong">
          {claim.name}
        </code>
        <p className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-faint">
          {CLAIM_LABELS[claim.name]}
        </p>
      </div>

      <div className="min-w-0 space-y-1">
        <p className="break-words font-mono text-xs leading-5 text-ink">
          {claim.raw}
        </p>
        {claim.dateIso && (
          <p className="break-words text-[11px] text-muted">
            {claim.dateIso}
          </p>
        )}
        {claim.relative && (
          <p className="text-[11px] text-faint">{claim.relative}</p>
        )}
      </div>

      <Badge variant={claimBadgeVariant(claim.status)}>
        {CLAIM_STATUS_LABELS[claim.status]}
      </Badge>
    </li>
  );
}

function DecodedHeader({
  decoded,
  action,
}: {
  decoded: DecodedJwt;
  action?: ReactNode;
}) {
  const algorithm =
    typeof decoded.header.alg === "string" ? decoded.header.alg : null;
  const type = typeof decoded.header.typ === "string" ? decoded.header.typ : null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
      <h2 className="text-sm font-semibold text-ink">Header</h2>
      {algorithm && <Badge variant="accent">{algorithm}</Badge>}
      {type && <Badge variant="outline">{type}</Badge>}
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}

function ClaimsSummary({ claims }: { claims: JwtClaimReport }) {
  const withinLifetime =
    claims.hasExpiry &&
    !claims.expired &&
    !claims.notYetValid &&
    !claims.issuedInFuture &&
    !claims.nonStandard;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {claims.expired && <Badge variant="warning">Expired</Badge>}
      {claims.notYetValid && (
        <Badge variant="warning">Not yet valid</Badge>
      )}
      {claims.issuedInFuture && (
        <Badge variant="warning">Issued in future</Badge>
      )}
      {!claims.hasExpiry && <Badge variant="outline">No exp</Badge>}
      {claims.nonStandard && (
        <Badge variant="warning">Non-standard</Badge>
      )}
      {withinLifetime && (
        <Badge variant="success">Within lifetime</Badge>
      )}
    </div>
  );
}

export function JwtInspectorScreen() {
  const [token, setToken] = useState("");
  const [decodedState, setDecodedState] = useState<DecodedState | null>(
    null,
  );
  const [notice, setNotice] = useState<Notice | null>(null);
  const [copyTarget, setCopyTarget] = useState<string | null>(null);

  const tokenRef = useRef<HTMLTextAreaElement>(null);

  const stale =
    decodedState !== null && token.trim() !== decodedState.source;

  function handleInput(value: string) {
    setToken(value);
    setNotice(null);
  }

  function handleDecode() {
    const source = token.trim();

    if (source.length === 0) {
      setDecodedState(null);
      setNotice({
        kind: "warning",
        message: "Paste a JWT to inspect.",
      });
      tokenRef.current?.focus();
      return;
    }

    const result = decodeJwt(source);

    if (!result.ok) {
      setDecodedState(null);
      setNotice({ kind: "error", message: result.error.message });
      return;
    }

    setDecodedState({
      source,
      decoded: result.decoded,
      claims: inspectClaims(result.decoded.payload),
    });
    setNotice({
      kind: "success",
      message: "Decoded locally. Signature is not verified.",
    });
  }

  function handleClear() {
    setToken("");
    setDecodedState(null);
    setNotice({
      kind: "info",
      message: "Cleared the token and decoded output.",
    });
    tokenRef.current?.focus();
  }

  async function handleCopy(text: string, label: string) {
    if (copyTarget) return;

    setCopyTarget(label);
    const copied = await copyTextToClipboard(text);
    setCopyTarget(null);

    if (copied) {
      setNotice({ kind: "success", message: `Copied ${label}.` });
      return;
    }

    setNotice({
      kind: "error",
      message: `Could not copy ${label}. Select it and copy manually.`,
    });
  }

  const headerJson = decodedState
    ? prettyJson(decodedState.decoded.header)
    : "";
  const payloadJson = decodedState
    ? prettyJson(decodedState.decoded.payload)
    : "";

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow={module.milestone}
        title={module.name}
        description="Decode a JWT locally and inspect its header, payload, claims, and lifetime. DevLens never sends a token anywhere."
        actions={<Badge variant="accent">Local only</Badge>}
      />

      <Card
        role="note"
        aria-label="Signature verification warning"
        className="flex items-start gap-3 border-warning/25 bg-warning/[0.04] px-4 py-3"
      >
        <LockIcon className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">
            Signature unverified
          </p>
          <p className="mt-1 text-xs leading-5 text-muted">
            Decoding does not prove a token is authentic. DevLens reads the
            token locally but does not verify its signature, so treat the
            header and payload as untrusted until the issuer verifies them.
          </p>
        </div>
        <Badge variant="warning">Unverified</Badge>
      </Card>

      <Card className="flex min-w-0 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-ink">Token</h2>
            {token.length > 0 && (
              <Badge variant="outline">
                {token.length.toLocaleString()} chars
              </Badge>
            )}
            {stale && <Badge variant="warning">Stale</Badge>}
          </div>
          <span className="text-[10px] uppercase tracking-[0.16em] text-faint">
            Compact JWT
          </span>
        </div>

        <div>
          <label htmlFor="jwt-token" className="sr-only">
            JWT token
          </label>
          <textarea
            id="jwt-token"
            ref={tokenRef}
            value={token}
            onChange={(event) => handleInput(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                (event.metaKey || event.ctrlKey)
              ) {
                event.preventDefault();
                handleDecode();
              }
            }}
            aria-describedby="jwt-token-help"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            placeholder="Paste a compact JWT: header.payload.signature"
            className="h-40 w-full resize-y bg-transparent px-4 py-3 font-mono text-[12.5px] leading-6 text-ink placeholder:text-faint focus-visible:outline-offset-[-2px]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
          <Button
            size="sm"
            variant="primary"
            onClick={handleDecode}
            disabled={token.trim().length === 0}
          >
            <ScanIcon className="size-3.5" />
            Decode
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleClear}
            disabled={token.length === 0 && decodedState === null}
            className="text-danger hover:bg-danger/10 hover:text-danger"
          >
            <TrashIcon className="size-3.5" />
            Clear
          </Button>
          <span
            id="jwt-token-help"
            className="ml-auto text-[10px] text-faint"
          >
            <Kbd>Ctrl</Kbd> / <Kbd>⌘</Kbd> + <Kbd>Enter</Kbd> to decode.
            Tokens are never stored.
          </span>
        </div>
      </Card>

      {notice && (
        <Notice kind={notice.kind} message={notice.message} />
      )}

      {decodedState ? (
        <>
          {stale && (
            <Notice
              kind="warning"
              message="The token changed after this decode. Decode again to refresh the results."
            />
          )}

          <div className="grid min-w-0 gap-4 xl:grid-cols-2">
            <Card className="flex min-w-0 flex-col overflow-hidden">
              <DecodedHeader
                decoded={decodedState.decoded}
                action={
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void handleCopy(headerJson, "decoded header")
                    }
                    disabled={copyTarget !== null}
                  >
                    <CopyIcon className="size-3.5" />
                    {copyTarget === "decoded header"
                      ? "Copying…"
                      : "Copy header"}
                  </Button>
                }
              />
              <div className="h-[clamp(14rem,28vh,24rem)] min-h-0">
                <JsonCodeEditor label="Decoded JWT header" value={headerJson} readOnly />
              </div>
            </Card>

            <Card className="flex min-w-0 flex-col overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
                <h2 className="text-sm font-semibold text-ink">
                  Payload
                </h2>
                <Badge variant="outline">
                  {Object.keys(decodedState.decoded.payload).length} keys
                </Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  onClick={() =>
                    void handleCopy(payloadJson, "decoded payload")
                  }
                  disabled={copyTarget !== null}
                >
                  <CopyIcon className="size-3.5" />
                  {copyTarget === "decoded payload"
                    ? "Copying…"
                    : "Copy payload"}
                </Button>
              </div>
              <div className="h-[clamp(14rem,28vh,24rem)] min-h-0">
                <JsonCodeEditor label="Decoded JWT payload" value={payloadJson} readOnly />
              </div>
            </Card>
          </div>

          <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
            <Card className="flex min-w-0 flex-col overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
                <h2 className="text-sm font-semibold text-ink">
                  Signature
                </h2>
                <Badge variant="warning">Unverified</Badge>
                <Badge variant="outline">
                  {decodedState.decoded.signatureBytes} bytes
                </Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  onClick={() =>
                    void handleCopy(
                      decodedState.decoded.signature,
                      "signature",
                    )
                  }
                  disabled={
                    copyTarget !== null ||
                    decodedState.decoded.signature.length === 0
                  }
                >
                  <CopyIcon className="size-3.5" />
                  {copyTarget === "signature"
                    ? "Copying…"
                    : "Copy signature"}
                </Button>
              </div>
              <div className="min-w-0 flex-1 space-y-3 p-4">
                <code className="block break-all font-mono text-xs leading-6 text-muted">
                  {decodedState.decoded.signature ||
                    "Empty signature segment"}
                </code>
                <p className="text-[11px] leading-5 text-faint">
                  This is the signature segment as written in the token.
                  DevLens does not verify it, and an empty segment is not
                  proof that the token is unsigned or valid.
                </p>
              </div>
            </Card>

            <Card className="min-w-0 overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold text-ink">
                    Claims
                  </h2>
                  <p className="mt-0.5 text-xs text-faint">
                    Registered claims from the payload, evaluated against
                    your local clock.
                  </p>
                </div>
                <ClaimsSummary claims={decodedState.claims} />
              </div>
              <ul className="divide-y divide-line">
                {decodedState.claims.claims.map((claim) => (
                  <ClaimRow key={claim.name} claim={claim} />
                ))}
              </ul>
            </Card>
          </div>
        </>
      ) : (
        <Card>
          <div className="grid place-items-center px-6 py-14">
            <EmptyState
              icon={<KeyIcon className="size-5" />}
              title="No token decoded"
              description="Paste a compact JWT above and decode it locally. Header, payload, signature, and registered claims appear here without any network request."
            />
          </div>
        </Card>
      )}
    </section>
  );
}
