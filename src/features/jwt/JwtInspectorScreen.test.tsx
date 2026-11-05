import { EditorView } from "@codemirror/view";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JwtInspectorScreen } from "./JwtInspectorScreen";

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function encode(value: unknown): string {
  return toBase64Url(JSON.stringify(value));
}

function makeToken(
  payload: Record<string, unknown> = {},
  header: Record<string, unknown> = { alg: "RS256", typ: "JWT" },
  signature: string = toBase64Url("signature"),
): string {
  return `${encode(header)}.${encode(payload)}.${signature}`;
}

function validPayload(): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);

  return {
    exp: now + 3_600,
    iat: now - 60,
    nbf: now - 60,
    iss: "https://issuer.example",
    sub: "user-1",
    aud: ["api", "web"],
    jti: "id-1",
  };
}

function tokenInput(): HTMLTextAreaElement {
  return screen.getByRole("textbox", {
    name: "JWT token",
  }) as HTMLTextAreaElement;
}

function decodeToken(token: string) {
  fireEvent.change(tokenInput(), { target: { value: token } });
  fireEvent.click(screen.getByRole("button", { name: "Decode" }));
}

function codeText(label: string): string {
  const editor = screen.getByRole("textbox", { name: label });
  const view = EditorView.findFromDOM(editor);
  return view?.state.doc.toString() ?? "";
}

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window.navigator, "clipboard");
});

describe("JwtInspectorScreen", () => {
  it("renders the security warning, token input, and empty state", () => {
    render(<JwtInspectorScreen />);

    expect(
      screen.getByRole("heading", { level: 1, name: "JWT Inspector" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("note", {
        name: "Signature verification warning",
      }),
    ).toHaveTextContent("Signature unverified");
    expect(tokenInput()).toBeInTheDocument();
    expect(screen.getByText("No token decoded")).toBeInTheDocument();
  });

  it("decodes a token and shows header, payload, signature, and claims", async () => {
    const token = makeToken(validPayload());
    render(<JwtInspectorScreen />);

    decodeToken(token);

    await waitFor(() => {
      expect(
        screen.getByRole("textbox", {
          name: "Decoded JWT header",
        }),
      ).toBeInTheDocument();
    });

    expect(codeText("Decoded JWT header")).toContain('"alg": "RS256"');
    expect(codeText("Decoded JWT header")).toContain('"typ": "JWT"');
    expect(codeText("Decoded JWT payload")).toContain('"sub": "user-1"');
    expect(codeText("Decoded JWT payload")).toContain('"aud"');
    expect(screen.getByText("Expiration time")).toBeInTheDocument();
    expect(screen.getByText("Issuer")).toBeInTheDocument();
    expect(screen.getByText("Within lifetime")).toBeInTheDocument();
    expect(screen.getByText("9 bytes")).toBeInTheDocument();
    expect(
      screen.getByText("Decoded locally. Signature is not verified."),
    ).toBeInTheDocument();
  });

  it("shows expired and not-yet-valid claims", () => {
    const now = Math.floor(Date.now() / 1000);
    const token = makeToken({
      exp: now - 60,
      nbf: now + 3_600,
      iat: now + 60,
    });
    render(<JwtInspectorScreen />);

    decodeToken(token);

    expect(screen.getAllByText("Expired").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Not yet valid").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Issued in future").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("Within lifetime")).not.toBeInTheDocument();
  });

  it("reports malformed tokens without echoing the token", () => {
    const token = "not-a-token";
    render(<JwtInspectorScreen />);

    decodeToken(token);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/missing segments/);
    expect(alert).not.toHaveTextContent(token);
    expect(screen.getByText("No token decoded")).toBeInTheDocument();
    expect(screen.queryByText("Claims")).not.toBeInTheDocument();
  });

  it("reports an invalid payload with a safe message", () => {
    const token = `${encode({ alg: "none" })}.${toBase64Url("[")}.${toBase64Url("sig")}`;
    render(<JwtInspectorScreen />);

    decodeToken(token);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Payload is not valid JSON.",
    );
    expect(screen.getByText("No token decoded")).toBeInTheDocument();
  });

  it("marks decoded results stale when the token changes", () => {
    render(<JwtInspectorScreen />);

    decodeToken(makeToken(validPayload()));
    expect(screen.queryByText("Stale")).not.toBeInTheDocument();

    fireEvent.change(tokenInput(), {
      target: { value: `${tokenInput().value}x` },
    });

    expect(screen.getByText("Stale")).toBeInTheDocument();
    expect(
      screen.getByText(/The token changed after this decode/),
    ).toBeInTheDocument();
  });

  it("clears the token and decoded output", () => {
    render(<JwtInspectorScreen />);

    decodeToken(makeToken(validPayload()));
    expect(screen.getByText("Claims")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(tokenInput()).toHaveValue("");
    expect(screen.getByText("No token decoded")).toBeInTheDocument();
    expect(
      screen.getByText("Cleared the token and decoded output."),
    ).toBeInTheDocument();
  });

  it("decodes with Ctrl+Enter", async () => {
    render(<JwtInspectorScreen />);

    fireEvent.change(tokenInput(), {
      target: { value: makeToken(validPayload()) },
    });
    fireEvent.keyDown(tokenInput(), {
      key: "Enter",
      ctrlKey: true,
    });

    await waitFor(() => {
      expect(
        screen.getByRole("textbox", {
          name: "Decoded JWT payload",
        }),
      ).toBeInTheDocument();
    });
  });

  it("copies the decoded header without copying the token", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<JwtInspectorScreen />);

    decodeToken(makeToken(validPayload()));
    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "Copy decoded header",
        }),
      ).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Copy decoded header",
      }),
    );

    expect(
      await screen.findByText("Copied decoded header."),
    ).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('"alg": "RS256"'),
    );
    expect(writeText.mock.calls[0]?.[0]).not.toContain(
      makeToken(validPayload()),
    );
  });

  it("shows an empty signature without claiming the token is valid", () => {
    render(<JwtInspectorScreen />);

    decodeToken(
      `${encode({ alg: "none" })}.${encode({ sub: "user-1" })}.`,
    );

    expect(screen.getByText("Empty signature segment")).toBeInTheDocument();
    expect(screen.getByText("0 bytes")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Copy JWT signature" }),
    ).toBeDisabled();
  });

  it("does not make a network request while decoding", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<JwtInspectorScreen />);

    decodeToken(makeToken(validPayload()));

    expect(screen.getByText("Claims")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
