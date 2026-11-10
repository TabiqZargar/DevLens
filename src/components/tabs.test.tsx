import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Tabs, type TabItem } from "./tabs";

const ITEMS = [
  { id: "overview", label: "Overview" },
  { id: "request", label: "Request" },
  { id: "response", label: "Response" },
] as const satisfies readonly TabItem<"overview" | "request" | "response">[];

function Harness() {
  const [value, setValue] = useState<"overview" | "request" | "response">(
    "overview",
  );

  return (
    <>
      <Tabs
        items={ITEMS}
        value={value}
        onChange={setValue}
        label="Request details"
        idPrefix="detail"
        panelId="detail-panel"
      />
      <div role="tabpanel" id="detail-panel" aria-labelledby={`detail-${value}`}>
        {value}
      </div>
    </>
  );
}

describe("Tabs", () => {
  it("selects tabs by click and exposes roving tabindex", () => {
    render(<Harness />);

    const overview = screen.getByRole("tab", { name: "Overview" });
    const request = screen.getByRole("tab", { name: "Request" });

    expect(overview).toHaveAttribute("aria-selected", "true");
    expect(overview).toHaveAttribute("tabindex", "0");
    expect(request).toHaveAttribute("tabindex", "-1");

    fireEvent.click(request);

    expect(request).toHaveAttribute("aria-selected", "true");
    expect(overview).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("request");
    expect(screen.getByRole("tabpanel")).toHaveAttribute(
      "aria-labelledby",
      "detail-request",
    );
  });

  it("moves selection and focus with arrow, Home, and End keys", () => {
    render(<Harness />);

    const overview = screen.getByRole("tab", { name: "Overview" });
    const request = screen.getByRole("tab", { name: "Request" });
    const response = screen.getByRole("tab", { name: "Response" });

    fireEvent.keyDown(overview, { key: "ArrowRight" });

    expect(request).toHaveFocus();
    expect(request).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(request, { key: "End" });

    expect(response).toHaveFocus();
    expect(response).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(response, { key: "ArrowRight" });

    expect(overview).toHaveFocus();
    expect(overview).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(overview, { key: "Home" });

    expect(overview).toHaveFocus();
  });
});
