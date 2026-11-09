import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PAGE_INSPECTION_LIMITS,
  PAGE_INSPECTION_MESSAGE,
  type PageInspectionResult,
} from "./page-inspection";
import { PageInspectorScreen } from "./PageInspectorScreen";

function sampleResult(): PageInspectionResult {
  return {
    overview: {
      title: "Docs — Example",
      url: "https://example.com/docs",
      metaDescription: "Example documentation.",
      canonicalUrl: "https://example.com/docs",
      language: "en",
      viewport: "width=device-width, initial-scale=1",
    },
    headings: {
      items: [
        { level: 1, text: "Introduction" },
        { level: 3, text: "Details" },
      ],
      total: 2,
      truncated: false,
      h1Count: 1,
      missingH1: false,
      jumps: [{ from: 1, to: 3, text: "Details" }],
    },
    links: {
      items: [
        {
          text: "Next",
          href: "https://example.com/next",
          target: "_blank",
          opensInNewTab: true,
          emptyText: false,
        },
        {
          text: "",
          href: "https://example.com/empty",
          target: null,
          opensInNewTab: false,
          emptyText: true,
        },
      ],
      total: 2,
      truncated: false,
      emptyTextCount: 1,
    },
    images: {
      items: [
        {
          src: "https://example.com/hero.png",
          alt: null,
          naturalWidth: 1_200,
          naturalHeight: 630,
          displayWidth: 600,
          displayHeight: 315,
          missingAlt: true,
        },
      ],
      total: 1,
      truncated: false,
      missingAltCount: 1,
    },
    forms: {
      items: [
        {
          action: "https://example.com/search",
          method: "get",
          controls: [
            {
              tag: "input",
              type: "search",
              name: "q",
              label: "Search",
              placeholder: "Find docs",
              required: false,
              disabled: false,
            },
          ],
          totalControls: 1,
          truncated: false,
        },
      ],
      total: 1,
      truncated: false,
      controlCount: 1,
      unlabeledControlCount: 0,
      sampledControls: 1,
    },
    accessibility: {
      findings: [
        {
          code: "image-missing-alt",
          severity: "warning",
          message: "1 image has no alt attribute.",
        },
        {
          code: "heading-level-jump",
          severity: "info",
          message: "Heading level jumps from h1 to h3 at “Details”.",
        },
      ],
    },
    capturedAt: "2026-01-01T12:00:00.000Z",
    limits: PAGE_INSPECTION_LIMITS,
  };
}

function successResponse(result = sampleResult()) {
  return {
    type: PAGE_INSPECTION_MESSAGE,
    ok: true as const,
    data: result,
  };
}

function stubChrome(
  options: {
    executeScript?: () => Promise<unknown>;
    sendMessage?: () => Promise<unknown>;
  } = {},
) {
  const executeScript = vi.fn(
    options.executeScript ?? (async () => []),
  );
  const sendMessage = vi.fn(
    options.sendMessage ?? (async () => successResponse()),
  );

  vi.stubGlobal("chrome", {
    runtime: { id: "test-extension" },
    scripting: { executeScript },
    tabs: { sendMessage },
  });

  return { executeScript, sendMessage };
}

function setTarget(tabId: number | null): void {
  window.history.replaceState(
    null,
    "",
    tabId === null ? "/" : `/?targetTabId=${tabId}`,
  );
}

beforeEach(() => {
  setTarget(12);
  window.location.hash = "";
});

afterEach(() => {
  vi.unstubAllGlobals();
  setTarget(null);
  window.location.hash = "";
});

describe("PageInspectorScreen", () => {
  it("explains how to capture a target when the route has none", () => {
    setTarget(null);
    stubChrome();

    render(<PageInspectorScreen />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Page Inspector",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Open DevLens on the page you want to inspect/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Inspect page" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Inspection boundary/i),
    ).toBeInTheDocument();
  });

  it("waits for an explicit click before reading the target tab", async () => {
    const { executeScript, sendMessage } = stubChrome();

    render(<PageInspectorScreen />);

    expect(screen.getByText("Target tab captured")).toBeInTheDocument();
    expect(executeScript).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Inspect page" }),
    );

    expect(
      (await screen.findAllByText("Docs — Example")).length,
    ).toBeGreaterThan(0);
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 12 },
      files: ["content.js"],
    });
    expect(sendMessage).toHaveBeenCalledWith(12, {
      type: PAGE_INSPECTION_MESSAGE,
    });
  });

  it("renders the overview after a successful snapshot", async () => {
    stubChrome();

    render(<PageInspectorScreen />);
    fireEvent.click(
      screen.getByRole("button", { name: "Inspect page" }),
    );

    expect(
      (await screen.findAllByText("Docs — Example")).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText("Example documentation."),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("https://example.com/docs").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("tab", { name: /Overview/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /Accessibility\s*2/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/This snapshot exists only in this workspace tab/i),
    ).toBeInTheDocument();
  });

  it("switches between structure, links, images, forms, and accessibility", async () => {
    stubChrome();

    render(<PageInspectorScreen />);
    fireEvent.click(
      screen.getByRole("button", { name: "Inspect page" }),
    );

    await screen.findAllByText("Docs — Example");

    fireEvent.click(screen.getByRole("tab", { name: /Structure/ }));
    expect(screen.getByText("Introduction")).toBeInTheDocument();
    expect(screen.getByText(/Heading level jumps/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Links/ }));
    expect(screen.getByText("Next")).toBeInTheDocument();
    expect(
      screen.getByText("https://example.com/empty"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("(no accessible text)"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Images/ }));
    expect(
      screen.getByText("https://example.com/hero.png"),
    ).toBeInTheDocument();
    expect(screen.getByText("Missing alt")).toBeInTheDocument();
    expect(
      screen.getByText(/Natural 1200 × 630/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Forms/ }));
    expect(
      screen.getByText(/Entered values, passwords, and file selections are never read/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Search")).toBeInTheDocument();
    expect(screen.getByText("Find docs")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("tab", { name: /Accessibility/ }),
    );
    expect(
      screen.getByText("1 image has no alt attribute."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/not a WCAG conformance audit/i),
    ).toBeInTheDocument();
  });

  it("shows loading and keeps the explicit action disabled while reading", async () => {
    let resolveResponse!: (value: unknown) => void;
    const pending = new Promise<unknown>((resolve) => {
      resolveResponse = resolve;
    });

    stubChrome({
      sendMessage: () => pending,
    });

    render(<PageInspectorScreen />);
    fireEvent.click(
      screen.getByRole("button", { name: "Inspect page" }),
    );

    expect(
      screen.getByText("Reading the page snapshot…"),
    ).toBeInTheDocument();

    resolveResponse(successResponse());

    expect(
      (await screen.findAllByText("Docs — Example")).length,
    ).toBeGreaterThan(0);
  });

  it("shows a retryable error when the page cannot be inspected", async () => {
    const executeScript = vi.fn(async () => {
      throw new Error("Cannot access a chrome:// URL");
    });
    const sendMessage = vi.fn();

    vi.stubGlobal("chrome", {
      runtime: { id: "test-extension" },
      scripting: { executeScript },
      tabs: { sendMessage },
    });

    render(<PageInspectorScreen />);
    fireEvent.click(
      screen.getByRole("button", { name: "Inspect page" }),
    );

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByText(/DevLens cannot inspect this page/i),
    ).toBeInTheDocument();
    expect(screen.getByText("restricted")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("clears the in-memory snapshot on request", async () => {
    stubChrome();

    render(<PageInspectorScreen />);
    fireEvent.click(
      screen.getByRole("button", { name: "Inspect page" }),
    );
    await screen.findAllByText("Docs — Example");

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    await waitFor(() => {
      expect(
        screen.queryAllByText("Docs — Example"),
      ).toHaveLength(0);
    });
    expect(screen.getByText("Target tab captured")).toBeInTheDocument();
  });
});
