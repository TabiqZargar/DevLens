export const PAGE_INSPECTION_MESSAGE = "devlens:page-inspect" as const;

export const PAGE_INSPECTION_LIMITS = {
  headings: 200,
  headingJumps: 20,
  links: 300,
  images: 200,
  forms: 50,
  formControls: 100,
  findings: 50,
  text: 300,
  url: 2_000,
} as const;

export type PageInspectionLimits = typeof PAGE_INSPECTION_LIMITS;

export type PageHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface PageInspectionOverview {
  title: string;
  url: string;
  metaDescription: string | null;
  canonicalUrl: string | null;
  language: string | null;
  viewport: string | null;
}

export interface PageHeading {
  level: PageHeadingLevel;
  text: string;
}

export interface PageHeadingJump {
  from: PageHeadingLevel;
  to: PageHeadingLevel;
  text: string;
}

export interface PageHeadingReport {
  items: PageHeading[];
  total: number;
  truncated: boolean;
  h1Count: number;
  missingH1: boolean;
  jumps: PageHeadingJump[];
}

export interface PageLink {
  text: string;
  href: string | null;
  target: string | null;
  opensInNewTab: boolean;
  emptyText: boolean;
}

export interface PageLinkReport {
  items: PageLink[];
  total: number;
  truncated: boolean;
  emptyTextCount: number;
}

export interface PageImage {
  src: string;
  alt: string | null;
  naturalWidth: number;
  naturalHeight: number;
  displayWidth: number;
  displayHeight: number;
  missingAlt: boolean;
}

export interface PageImageReport {
  items: PageImage[];
  total: number;
  truncated: boolean;
  missingAltCount: number;
}

export type PageFormControlTag = "input" | "select" | "textarea" | "button";

export interface PageFormControl {
  tag: PageFormControlTag;
  type: string;
  name: string;
  label: string | null;
  placeholder: string | null;
  required: boolean;
  disabled: boolean;
}

export interface PageForm {
  action: string;
  method: string;
  controls: PageFormControl[];
  totalControls: number;
  truncated: boolean;
}

export interface PageFormReport {
  items: PageForm[];
  total: number;
  truncated: boolean;
  controlCount: number;
  unlabeledControlCount: number;
  sampledControls: number;
}

export type PageAccessibilityCode =
  | "missing-title"
  | "missing-lang"
  | "missing-meta-description"
  | "missing-viewport"
  | "missing-h1"
  | "multiple-h1"
  | "heading-level-jump"
  | "empty-link"
  | "image-missing-alt"
  | "unlabeled-form-control"
  | "missing-main-landmark";

export type PageAccessibilitySeverity = "warning" | "info";

export interface PageAccessibilityFinding {
  code: PageAccessibilityCode;
  severity: PageAccessibilitySeverity;
  message: string;
}

export interface PageAccessibilityReport {
  findings: PageAccessibilityFinding[];
}

export interface PageInspectionResult {
  overview: PageInspectionOverview;
  headings: PageHeadingReport;
  links: PageLinkReport;
  images: PageImageReport;
  forms: PageFormReport;
  accessibility: PageAccessibilityReport;
  capturedAt: string;
  limits: PageInspectionLimits;
}

export interface PageInspectionRequest {
  type: typeof PAGE_INSPECTION_MESSAGE;
}

export type PageInspectionErrorCode =
  | "invalid-request"
  | "inspection-failed"
  | "runtime-unavailable"
  | "no-target"
  | "restricted"
  | "injection-failed"
  | "no-response"
  | "invalid-response";

export interface PageInspectionError {
  code: PageInspectionErrorCode;
  message: string;
}

export type PageInspectionResponse =
  | {
      type: typeof PAGE_INSPECTION_MESSAGE;
      ok: true;
      data: PageInspectionResult;
    }
  | {
      type: typeof PAGE_INSPECTION_MESSAGE;
      ok: false;
      error: PageInspectionError;
    };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeText(
  value: string | null | undefined,
  limit: number = PAGE_INSPECTION_LIMITS.text,
): string {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function readAttribute(
  element: Element,
  name: string,
  limit: number = PAGE_INSPECTION_LIMITS.text,
): string | null {
  const value = element.getAttribute(name);
  return value === null ? null : normalizeText(value, limit);
}

function resolveUrl(
  element: Element,
  attribute: string,
  baseUrl: string,
): string | null {
  const raw = element.getAttribute(attribute);

  if (raw === null) return null;

  const trimmed = raw.trim();
  if (trimmed.length === 0) return "";

  try {
    return normalizeText(new URL(trimmed, baseUrl).href, PAGE_INSPECTION_LIMITS.url);
  } catch {
    return normalizeText(trimmed, PAGE_INSPECTION_LIMITS.url);
  }
}

function metaContent(doc: Document, name: string): string | null {
  const element = doc.querySelector(`meta[name="${name}" i]`);
  const content = element?.getAttribute("content") ?? null;
  const normalized = normalizeText(content);
  return normalized.length > 0 ? normalized : null;
}

function headingLevel(tagName: string): PageHeadingLevel | null {
  const level = Number(tagName.slice(1));
  return level >= 1 && level <= 6 ? (level as PageHeadingLevel) : null;
}

function linkText(anchor: Element): string {
  const visible = normalizeText(anchor.textContent);

  if (visible.length > 0) return visible;

  const ariaLabel = readAttribute(anchor, "aria-label");
  if (ariaLabel && ariaLabel.length > 0) return ariaLabel;

  for (const image of anchor.querySelectorAll("img")) {
    const alt = readAttribute(image, "alt");
    if (alt && alt.length > 0) return alt;
  }

  const title = readAttribute(anchor, "title");
  return title && title.length > 0 ? title : "";
}

function isDecorativeImage(image: Element): boolean {
  const role = readAttribute(image, "role");
  const ariaHidden = readAttribute(image, "aria-hidden");

  return (
    role === "presentation" ||
    role === "none" ||
    ariaHidden === "true"
  );
}

function createLabelMap(doc: Document): Map<string, string> {
  const labels = new Map<string, string>();

  for (const label of doc.querySelectorAll("label[for]")) {
    const target = readAttribute(label, "for");

    if (!target || labels.has(target)) continue;

    const text = normalizeText(label.textContent);
    if (text.length > 0) {
      labels.set(target, text);
    }
  }

  return labels;
}

function formControlLabel(
  control: Element,
  labels: ReadonlyMap<string, string>,
): string | null {
  const ariaLabel = readAttribute(control, "aria-label");
  if (ariaLabel && ariaLabel.length > 0) return ariaLabel;

  const labelledBy = readAttribute(control, "aria-labelledby");
  if (labelledBy && labelledBy.length > 0) {
    const parts: string[] = [];

    for (const id of labelledBy.split(/\s+/)) {
      const target = control.ownerDocument.getElementById(id);
      const text = normalizeText(target?.textContent);
      if (text.length > 0) parts.push(text);
    }

    if (parts.length > 0) {
      return normalizeText(parts.join(" "));
    }
  }

  const id = readAttribute(control, "id");
  if (id) {
    const explicit = labels.get(id);
    if (explicit) return explicit;
  }

  const wrapping = control.closest("label");
  if (wrapping) {
    const text = normalizeText(wrapping.textContent);
    if (text.length > 0) return text;
  }

  const title = readAttribute(control, "title");
  if (title && title.length > 0) return title;

  if (control.tagName.toLowerCase() === "button") {
    const text = normalizeText(control.textContent);
    if (text.length > 0) return text;
  }

  return null;
}

function controlTag(element: Element): PageFormControlTag | null {
  const tag = element.tagName.toLowerCase();

  return tag === "input" ||
    tag === "select" ||
    tag === "textarea" ||
    tag === "button"
    ? tag
    : null;
}

function controlType(tag: PageFormControlTag, element: Element): string {
  const explicit = readAttribute(element, "type")?.toLowerCase();

  if (tag === "input") {
    return explicit && explicit.length > 0 ? explicit : "text";
  }

  if (tag === "button") {
    return explicit && explicit.length > 0 ? explicit : "submit";
  }

  return tag;
}

const UNLABELED_CONTROL_EXCLUSIONS = new Set([
  "hidden",
  "submit",
  "button",
  "reset",
  "image",
]);

function needsLabel(control: PageFormControl): boolean {
  return !UNLABELED_CONTROL_EXCLUSIONS.has(control.type);
}

function inspectHeadings(doc: Document): PageHeadingReport {
  const nodes = doc.querySelectorAll("h1, h2, h3, h4, h5, h6");
  const items: PageHeading[] = [];
  const jumps: PageHeadingJump[] = [];
  let previous: PageHeading | null = null;

  for (const node of nodes) {
    if (items.length >= PAGE_INSPECTION_LIMITS.headings) break;

    const level = headingLevel(node.tagName.toLowerCase());
    if (level === null) continue;

    const heading: PageHeading = {
      level,
      text: normalizeText(node.textContent),
    };

    items.push(heading);

    if (previous && level > previous.level + 1) {
      if (jumps.length < PAGE_INSPECTION_LIMITS.headingJumps) {
        jumps.push({
          from: previous.level,
          to: level,
          text: heading.text,
        });
      }
    }

    previous = heading;
  }

  const h1Count = doc.querySelectorAll("h1").length;

  return {
    items,
    total: nodes.length,
    truncated: nodes.length > items.length,
    h1Count,
    missingH1: h1Count === 0,
    jumps,
  };
}

function inspectLinks(doc: Document, baseUrl: string): PageLinkReport {
  const nodes = doc.querySelectorAll("a");
  const items: PageLink[] = [];
  let emptyTextCount = 0;

  for (const node of nodes) {
    if (items.length >= PAGE_INSPECTION_LIMITS.links) break;

    const text = linkText(node);
    const target = readAttribute(node, "target");
    const emptyText = text.length === 0;

    if (emptyText) emptyTextCount += 1;

    items.push({
      text,
      href: resolveUrl(node, "href", baseUrl),
      target,
      opensInNewTab: target?.toLowerCase() === "_blank",
      emptyText,
    });
  }

  return {
    items,
    total: nodes.length,
    truncated: nodes.length > items.length,
    emptyTextCount,
  };
}

function inspectImages(doc: Document): PageImageReport {
  const nodes = doc.querySelectorAll("img");
  const items: PageImage[] = [];
  let missingAltCount = 0;

  for (const node of nodes) {
    if (items.length >= PAGE_INSPECTION_LIMITS.images) break;

    const image = node as HTMLImageElement;
    const altAttribute = image.getAttribute("alt");
    const alt =
      altAttribute === null
        ? null
        : normalizeText(altAttribute);
    const missingAlt = altAttribute === null && !isDecorativeImage(image);
    const rect = image.getBoundingClientRect();

    if (missingAlt) missingAltCount += 1;

    items.push({
      src: normalizeText(
        image.currentSrc || image.src || image.getAttribute("src"),
        PAGE_INSPECTION_LIMITS.url,
      ),
      alt,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      displayWidth: Math.round(rect.width),
      displayHeight: Math.round(rect.height),
      missingAlt,
    });
  }

  return {
    items,
    total: nodes.length,
    truncated: nodes.length > items.length,
    missingAltCount,
  };
}

function inspectForms(
  doc: Document,
  baseUrl: string,
): PageFormReport {
  const nodes = doc.querySelectorAll("form");
  const labels = createLabelMap(doc);
  const items: PageForm[] = [];
  let controlCount = 0;
  let unlabeledControlCount = 0;
  let sampledControls = 0;

  for (const node of nodes) {
    if (items.length >= PAGE_INSPECTION_LIMITS.forms) break;

    const controls = node.querySelectorAll(
      "input, select, textarea, button",
    );
    const formControls: PageFormControl[] = [];

    controlCount += controls.length;

    for (const element of controls) {
      if (formControls.length >= PAGE_INSPECTION_LIMITS.formControls) {
        break;
      }

      const tag = controlTag(element);
      if (tag === null) continue;

      const control: PageFormControl = {
        tag,
        type: controlType(tag, element),
        name: readAttribute(element, "name") ?? "",
        label: formControlLabel(element, labels),
        placeholder:
          tag === "input" || tag === "textarea"
            ? readAttribute(element, "placeholder")
            : null,
        required: element.hasAttribute("required"),
        disabled: element.hasAttribute("disabled"),
      };

      formControls.push(control);
      sampledControls += 1;

      if (control.label === null && needsLabel(control)) {
        unlabeledControlCount += 1;
      }
    }

    items.push({
      action: resolveUrl(node, "action", baseUrl) ?? "",
      method:
        readAttribute(node, "method")?.toLowerCase() || "get",
      controls: formControls,
      totalControls: controls.length,
      truncated:
        controls.length > formControls.length,
    });
  }

  return {
    items,
    total: nodes.length,
    truncated: nodes.length > items.length,
    controlCount,
    unlabeledControlCount,
    sampledControls,
  };
}

function finding(
  code: PageAccessibilityCode,
  severity: PageAccessibilitySeverity,
  message: string,
): PageAccessibilityFinding {
  return { code, severity, message };
}

function sampleSuffix(truncated: boolean): string {
  return truncated ? " DevLens inspected only a bounded sample." : "";
}

function inspectAccessibility(
  doc: Document,
  overview: PageInspectionOverview,
  headings: PageHeadingReport,
  links: PageLinkReport,
  images: PageImageReport,
  forms: PageFormReport,
): PageAccessibilityReport {
  const findings: PageAccessibilityFinding[] = [];

  if (overview.title.length === 0) {
    findings.push(
      finding(
        "missing-title",
        "warning",
        "The page has no document title.",
      ),
    );
  }

  if (!overview.language) {
    findings.push(
      finding(
        "missing-lang",
        "warning",
        "The root element does not declare a document language.",
      ),
    );
  }

  if (!overview.metaDescription) {
    findings.push(
      finding(
        "missing-meta-description",
        "info",
        "No meta description was found.",
      ),
    );
  }

  if (!overview.viewport) {
    findings.push(
      finding(
        "missing-viewport",
        "info",
        "No viewport meta tag was found.",
      ),
    );
  }

  if (headings.missingH1) {
    findings.push(
      finding(
        "missing-h1",
        "warning",
        "The page has no h1 heading.",
      ),
    );
  } else if (headings.h1Count > 1) {
    findings.push(
      finding(
        "multiple-h1",
        "info",
        `The page has ${headings.h1Count} h1 headings.`,
      ),
    );
  }

  for (const jump of headings.jumps) {
    findings.push(
      finding(
        "heading-level-jump",
        "info",
        `Heading level jumps from h${jump.from} to h${jump.to}${
          jump.text.length > 0 ? ` at “${jump.text}”` : ""
        }.`,
      ),
    );
  }

  if (links.emptyTextCount > 0) {
    findings.push(
      finding(
        "empty-link",
        "warning",
        `${links.emptyTextCount} ${
          links.emptyTextCount === 1 ? "link has" : "links have"
        } no accessible text.${sampleSuffix(links.truncated)}`,
      ),
    );
  }

  if (images.missingAltCount > 0) {
    findings.push(
      finding(
        "image-missing-alt",
        "warning",
        `${images.missingAltCount} ${
          images.missingAltCount === 1 ? "image has" : "images have"
        } no alt attribute.${sampleSuffix(images.truncated)}`,
      ),
    );
  }

  if (forms.unlabeledControlCount > 0) {
    findings.push(
      finding(
        "unlabeled-form-control",
        "warning",
        `${forms.unlabeledControlCount} ${
          forms.unlabeledControlCount === 1
            ? "form control has"
            : "form controls have"
        } no associated label.${sampleSuffix(forms.truncated)}`,
      ),
    );
  }

  if (!doc.querySelector("main, [role='main']")) {
    findings.push(
      finding(
        "missing-main-landmark",
        "info",
        "No main landmark was found.",
      ),
    );
  }

  return {
    findings: findings.slice(0, PAGE_INSPECTION_LIMITS.findings),
  };
}

export function collectPageInspection(
  doc: Document,
  capturedAt: string = new Date().toISOString(),
): PageInspectionResult {
  const baseUrl = doc.URL || doc.baseURI || "";
  const title = normalizeText(doc.title);
  const canonicalElement = doc.querySelector("link[rel='canonical' i]");

  const overview: PageInspectionOverview = {
    title,
    url: normalizeText(baseUrl, PAGE_INSPECTION_LIMITS.url),
    metaDescription: metaContent(doc, "description"),
    canonicalUrl:
      canonicalElement === null
        ? null
        : resolveUrl(
            canonicalElement,
            "href",
            baseUrl,
          ),
    language: readAttribute(
      doc.documentElement,
      "lang",
    ),
    viewport: metaContent(doc, "viewport"),
  };

  const headings = inspectHeadings(doc);
  const links = inspectLinks(doc, baseUrl);
  const images = inspectImages(doc);
  const forms = inspectForms(doc, baseUrl);

  return {
    overview,
    headings,
    links,
    images,
    forms,
    accessibility: inspectAccessibility(
      doc,
      overview,
      headings,
      links,
      images,
      forms,
    ),
    capturedAt,
    limits: PAGE_INSPECTION_LIMITS,
  };
}

export function isPageInspectionRequest(
  value: unknown,
): value is PageInspectionRequest {
  const record = asRecord(value);
  return record !== null && record.type === PAGE_INSPECTION_MESSAGE;
}

function isText(value: unknown): value is string {
  return typeof value === "string";
}

function isNullableText(value: unknown): value is string | null {
  return value === null || isText(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0
  );
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isHeadingLevel(value: unknown): value is PageHeadingLevel {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 6
  );
}

function isOverview(value: unknown): value is PageInspectionOverview {
  const record = asRecord(value);
  if (!record) return false;

  return (
    isText(record.title) &&
    isText(record.url) &&
    isNullableText(record.metaDescription) &&
    isNullableText(record.canonicalUrl) &&
    isNullableText(record.language) &&
    isNullableText(record.viewport)
  );
}

function isHeadings(value: unknown): value is PageHeadingReport {
  const record = asRecord(value);
  if (!record || !Array.isArray(record.items)) return false;

  return (
    record.items.every((item) => {
      const heading = asRecord(item);
      return (
        heading !== null &&
        isHeadingLevel(heading.level) &&
        isText(heading.text)
      );
    }) &&
    isNonNegativeInteger(record.total) &&
    isBoolean(record.truncated) &&
    isNonNegativeInteger(record.h1Count) &&
    isBoolean(record.missingH1) &&
    Array.isArray(record.jumps) &&
    record.jumps.every((jump) => {
      const item = asRecord(jump);
      return (
        item !== null &&
        isHeadingLevel(item.from) &&
        isHeadingLevel(item.to) &&
        isText(item.text)
      );
    })
  );
}

function isLinks(value: unknown): value is PageLinkReport {
  const record = asRecord(value);
  if (!record || !Array.isArray(record.items)) return false;

  return (
    record.items.every((item) => {
      const link = asRecord(item);
      return (
        link !== null &&
        isText(link.text) &&
        isNullableText(link.href) &&
        isNullableText(link.target) &&
        isBoolean(link.opensInNewTab) &&
        isBoolean(link.emptyText)
      );
    }) &&
    isNonNegativeInteger(record.total) &&
    isBoolean(record.truncated) &&
    isNonNegativeInteger(record.emptyTextCount)
  );
}

function isImages(value: unknown): value is PageImageReport {
  const record = asRecord(value);
  if (!record || !Array.isArray(record.items)) return false;

  return (
    record.items.every((item) => {
      const image = asRecord(item);
      return (
        image !== null &&
        isText(image.src) &&
        isNullableText(image.alt) &&
        isNonNegativeInteger(image.naturalWidth) &&
        isNonNegativeInteger(image.naturalHeight) &&
        isNonNegativeInteger(image.displayWidth) &&
        isNonNegativeInteger(image.displayHeight) &&
        isBoolean(image.missingAlt)
      );
    }) &&
    isNonNegativeInteger(record.total) &&
    isBoolean(record.truncated) &&
    isNonNegativeInteger(record.missingAltCount)
  );
}

function isFormControl(value: unknown): value is PageFormControl {
  const record = asRecord(value);
  if (!record) return false;

  return (
    (record.tag === "input" ||
      record.tag === "select" ||
      record.tag === "textarea" ||
      record.tag === "button") &&
    isText(record.type) &&
    isText(record.name) &&
    isNullableText(record.label) &&
    isNullableText(record.placeholder) &&
    isBoolean(record.required) &&
    isBoolean(record.disabled)
  );
}

function isForms(value: unknown): value is PageFormReport {
  const record = asRecord(value);
  if (!record || !Array.isArray(record.items)) return false;

  return (
    record.items.every((item) => {
      const form = asRecord(item);
      return (
        form !== null &&
        isText(form.action) &&
        isText(form.method) &&
        Array.isArray(form.controls) &&
        form.controls.every(isFormControl) &&
        isNonNegativeInteger(form.totalControls) &&
        isBoolean(form.truncated)
      );
    }) &&
    isNonNegativeInteger(record.total) &&
    isBoolean(record.truncated) &&
    isNonNegativeInteger(record.controlCount) &&
    isNonNegativeInteger(record.unlabeledControlCount) &&
    isNonNegativeInteger(record.sampledControls)
  );
}

function isAccessibility(
  value: unknown,
): value is PageAccessibilityReport {
  const record = asRecord(value);
  if (!record || !Array.isArray(record.findings)) return false;

  return record.findings.every((item) => {
    const findingItem = asRecord(item);
    return (
      findingItem !== null &&
      isText(findingItem.code) &&
      (findingItem.severity === "warning" ||
        findingItem.severity === "info") &&
      isText(findingItem.message)
    );
  });
}

function isLimits(value: unknown): value is PageInspectionLimits {
  const record = asRecord(value);
  if (!record) return false;

  return Object.keys(PAGE_INSPECTION_LIMITS).every((key) =>
    isNonNegativeInteger(record[key]),
  );
}

export function isPageInspectionResult(
  value: unknown,
): value is PageInspectionResult {
  const record = asRecord(value);
  if (!record) return false;

  return (
    isOverview(record.overview) &&
    isHeadings(record.headings) &&
    isLinks(record.links) &&
    isImages(record.images) &&
    isForms(record.forms) &&
    isAccessibility(record.accessibility) &&
    isText(record.capturedAt) &&
    isLimits(record.limits)
  );
}

export function isPageInspectionResponse(
  value: unknown,
): value is PageInspectionResponse {
  const record = asRecord(value);
  if (!record || record.type !== PAGE_INSPECTION_MESSAGE) {
    return false;
  }

  if (record.ok === true) {
    return isPageInspectionResult(record.data);
  }

  if (record.ok !== false) return false;

  const error = asRecord(record.error);
  return (
    error !== null &&
    isText(error.code) &&
    isText(error.message)
  );
}
