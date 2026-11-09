import { afterEach, describe, expect, it } from "vitest";
import {
  collectPageInspection,
  isPageInspectionRequest,
  isPageInspectionResponse,
  isPageInspectionResult,
  PAGE_INSPECTION_LIMITS,
  PAGE_INSPECTION_MESSAGE,
} from "./page-inspection";

function setPage(head: string, body: string): void {
  document.head.innerHTML = head;
  document.body.innerHTML = body;
}

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("lang");
});

describe("page inspection", () => {
  it("collects overview metadata and resolves canonical URLs", () => {
    document.documentElement.lang = "en";
    setPage(
      `<title>Example Page</title>
       <meta name="description" content="A small example page." />
       <meta name="viewport" content="width=device-width, initial-scale=1" />
       <link rel="canonical" href="/canonical" />`,
      "<main><h1>Example</h1></main>",
    );

    const result = collectPageInspection(
      document,
      "2026-01-01T00:00:00.000Z",
    );

    expect(result.overview).toEqual({
      title: "Example Page",
      url: document.URL,
      metaDescription: "A small example page.",
      canonicalUrl: new URL("/canonical", document.URL).href,
      language: "en",
      viewport: "width=device-width, initial-scale=1",
    });
    expect(result.capturedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(result.limits).toBe(PAGE_INSPECTION_LIMITS);
  });

  it("collects heading order, missing H1, multiple H1s, and level jumps", () => {
    setPage(
      "<title>Headings</title>",
      `<main>
        <h1>First</h1>
        <h3>Third</h3>
        <h2>Second</h2>
      </main>`,
    );

    const result = collectPageInspection(document);

    expect(result.headings.items).toEqual([
      { level: 1, text: "First" },
      { level: 3, text: "Third" },
      { level: 2, text: "Second" },
    ]);
    expect(result.headings.jumps).toEqual([
      { from: 1, to: 3, text: "Third" },
    ]);
    expect(result.headings.h1Count).toBe(1);
    expect(result.headings.missingH1).toBe(false);

    setPage(
      "<title>More headings</title>",
      "<main><h2>Two</h2><h1>One</h1><h1>Another one</h1></main>",
    );

    const changed = collectPageInspection(document);

    expect(changed.headings.missingH1).toBe(false);
    expect(changed.headings.h1Count).toBe(2);
    expect(
      changed.accessibility.findings.some(
        (finding) => finding.code === "multiple-h1",
      ),
    ).toBe(true);
  });

  it("collects links, targets, and accessible link text", () => {
    setPage(
      "<title>Links</title>",
      `<main>
        <a href="/next" target="_blank">Next</a>
        <a href="/icon" aria-label="Icon link"><span></span></a>
        <a href="/image"><img src="/logo.png" alt="Logo" /></a>
        <a href="/empty"></a>
      </main>`,
    );

    const result = collectPageInspection(document);

    expect(result.links.total).toBe(4);
    expect(result.links.items[0]).toMatchObject({
      text: "Next",
      href: new URL("/next", document.URL).href,
      target: "_blank",
      opensInNewTab: true,
      emptyText: false,
    });
    expect(result.links.items[1]).toMatchObject({
      text: "Icon link",
      emptyText: false,
    });
    expect(result.links.items[2]).toMatchObject({
      text: "Logo",
      emptyText: false,
    });
    expect(result.links.items[3]).toMatchObject({
      text: "",
      emptyText: true,
    });
    expect(result.links.emptyTextCount).toBe(1);
  });

  it("collects image source, alt state, and dimensions without loading data", () => {
    setPage(
      "<title>Images</title>",
      `<main>
        <img src="/hero.png" />
        <img src="/decorative.png" alt="" />
        <img src="/presentational.png" role="presentation" />
        <img src="/described.png" alt="A described image" />
      </main>`,
    );

    const images = document.querySelectorAll("img");
    const hero = images[0] as HTMLImageElement;
    Object.defineProperty(hero, "naturalWidth", { value: 1_200 });
    Object.defineProperty(hero, "naturalHeight", { value: 630 });
    hero.getBoundingClientRect = () =>
      ({
        width: 600,
        height: 315,
      }) as DOMRect;

    const result = collectPageInspection(document);

    expect(result.images.total).toBe(4);
    expect(result.images.items[0]).toMatchObject({
      alt: null,
      naturalWidth: 1_200,
      naturalHeight: 630,
      displayWidth: 600,
      displayHeight: 315,
      missingAlt: true,
    });
    expect(result.images.items[1]).toMatchObject({
      alt: "",
      missingAlt: false,
    });
    expect(result.images.items[2]).toMatchObject({
      alt: null,
      missingAlt: false,
    });
    expect(result.images.items[3]).toMatchObject({
      alt: "A described image",
      missingAlt: false,
    });
    expect(result.images.missingAltCount).toBe(1);
  });

  it("collects form structure and labels without reading entered values", () => {
    setPage(
      "<title>Forms</title>",
      `<main>
        <form action="/save" method="post">
          <label for="email">Email address</label>
          <input id="email" name="email" type="email" placeholder="you@example.com" required />
          <input name="password" type="password" aria-label="Password" disabled />
          <textarea name="notes" aria-labelledby="notes-label"></textarea>
          <span id="notes-label">Notes</span>
          <select name="plan"><option>Pro</option></select>
          <button type="submit">Save</button>
          <input name="unlabeled" type="text" />
        </form>
      </main>`,
    );

    const email = document.querySelector<HTMLInputElement>(
      'input[name="email"]',
    );
    const password = document.querySelector<HTMLInputElement>(
      'input[name="password"]',
    );

    if (email) email.value = "secret-email-value";
    if (password) password.value = "secret-password-value";

    const result = collectPageInspection(document);

    expect(result.forms.total).toBe(1);
    expect(result.forms.items[0]?.action).toBe(
      new URL("/save", document.URL).href,
    );
    expect(result.forms.items[0]?.method).toBe("post");
    expect(result.forms.items[0]?.controls).toEqual([
      {
        tag: "input",
        type: "email",
        name: "email",
        label: "Email address",
        placeholder: "you@example.com",
        required: true,
        disabled: false,
      },
      {
        tag: "input",
        type: "password",
        name: "password",
        label: "Password",
        placeholder: null,
        required: false,
        disabled: true,
      },
      {
        tag: "textarea",
        type: "textarea",
        name: "notes",
        label: "Notes",
        placeholder: null,
        required: false,
        disabled: false,
      },
      {
        tag: "select",
        type: "select",
        name: "plan",
        label: null,
        placeholder: null,
        required: false,
        disabled: false,
      },
      {
        tag: "button",
        type: "submit",
        name: "",
        label: "Save",
        placeholder: null,
        required: false,
        disabled: false,
      },
      {
        tag: "input",
        type: "text",
        name: "unlabeled",
        label: null,
        placeholder: null,
        required: false,
        disabled: false,
      },
    ]);
    expect(result.forms.controlCount).toBe(6);
    expect(result.forms.sampledControls).toBe(6);
    expect(result.forms.unlabeledControlCount).toBe(2);
    expect(document.body.innerHTML).not.toContain("secret-email-value");
    expect(JSON.stringify(result)).not.toContain("secret-email-value");
    expect(JSON.stringify(result)).not.toContain("secret-password-value");
    expect(result.forms.items[0]?.controls[0]).not.toHaveProperty("value");
  });

  it("reports qualified accessibility findings", () => {
    setPage(
      "",
      `<h2>Section</h2><a href="/empty"></a><img src="/missing.png" />
       <form><input name="query" type="text" /></form>`,
    );

    const result = collectPageInspection(document);
    const codes = result.accessibility.findings.map(
      (finding) => finding.code,
    );

    expect(codes).toContain("missing-title");
    expect(codes).toContain("missing-lang");
    expect(codes).toContain("missing-meta-description");
    expect(codes).toContain("missing-viewport");
    expect(codes).toContain("missing-h1");
    expect(codes).toContain("empty-link");
    expect(codes).toContain("image-missing-alt");
    expect(codes).toContain("unlabeled-form-control");
    expect(codes).toContain("missing-main-landmark");
    expect(
      result.accessibility.findings.every(
        (finding) =>
          finding.severity === "warning" ||
          finding.severity === "info",
      ),
    ).toBe(true);
  });

  it("bounds large collections and marks them truncated", () => {
    const links = Array.from(
      { length: PAGE_INSPECTION_LIMITS.links + 25 },
      (_, index) => `<a href="/link-${index}">Link ${index}</a>`,
    ).join("");
    const images = Array.from(
      { length: PAGE_INSPECTION_LIMITS.images + 25 },
      (_, index) => `<img src="/image-${index}.png" alt="Image ${index}" />`,
    ).join("");

    setPage(
      "<title>Large page</title>",
      `<main>${links}${images}</main>`,
    );

    const result = collectPageInspection(document);

    expect(result.links.items).toHaveLength(PAGE_INSPECTION_LIMITS.links);
    expect(result.links.total).toBe(PAGE_INSPECTION_LIMITS.links + 25);
    expect(result.links.truncated).toBe(true);
    expect(result.images.items).toHaveLength(PAGE_INSPECTION_LIMITS.images);
    expect(result.images.total).toBe(PAGE_INSPECTION_LIMITS.images + 25);
    expect(result.images.truncated).toBe(true);
  });

  it("handles an empty document without throwing", () => {
    setPage("", "");

    const result = collectPageInspection(
      document,
      "2026-01-01T00:00:00.000Z",
    );

    expect(result.overview.title).toBe("");
    expect(result.headings.total).toBe(0);
    expect(result.links.total).toBe(0);
    expect(result.images.total).toBe(0);
    expect(result.forms.total).toBe(0);
    expect(Array.isArray(result.accessibility.findings)).toBe(true);
  });

  it("guards inspection requests and responses", () => {
    setPage("<title>Guard</title>", "<main><h1>Guard</h1></main>");

    const result = collectPageInspection(document);
    const response = {
      type: PAGE_INSPECTION_MESSAGE,
      ok: true,
      data: result,
    };

    expect(isPageInspectionRequest({ type: PAGE_INSPECTION_MESSAGE })).toBe(
      true,
    );
    expect(isPageInspectionRequest({ type: "devlens:other" })).toBe(false);
    expect(isPageInspectionResult(result)).toBe(true);
    expect(isPageInspectionResponse(response)).toBe(true);
    expect(
      isPageInspectionResponse({
        type: PAGE_INSPECTION_MESSAGE,
        ok: false,
        error: { code: "no-target", message: "No active tab." },
      }),
    ).toBe(true);
    expect(
      isPageInspectionResponse({
        type: PAGE_INSPECTION_MESSAGE,
        ok: true,
        data: { overview: {} },
      }),
    ).toBe(false);
  });
});
