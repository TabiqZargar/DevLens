import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { JsonValue } from "./json-core";
import { JsonTree } from "./json-tree";

describe("JsonTree", () => {
  it("renders the root expanded with typed nested values", () => {
    render(
      <JsonTree
        value={{
          name: "DevLens",
          meta: { active: true, count: 3 },
          tags: ["a", "b"],
        }}
      />,
    );

    expect(
      screen.getByRole("group", { name: "JSON structure" }),
    ).toBeInTheDocument();
    expect(screen.getByText('"name"')).toBeInTheDocument();
    expect(screen.getByText('"DevLens"')).toBeInTheDocument();
    expect(screen.getByText('"meta"')).toBeInTheDocument();
    expect(screen.queryByText('"active"')).not.toBeInTheDocument();

    const metaToggle = screen.getByRole("button", {
      name: 'Expand "meta"',
    });
    expect(metaToggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(metaToggle);

    expect(screen.getByText('"active"')).toBeInTheDocument();
    expect(screen.getByText("true")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("renders array indexes and values", () => {
    render(<JsonTree value={["alpha", "beta"]} />);

    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText('"alpha"')).toBeInTheDocument();
    expect(screen.getByText('"beta"')).toBeInTheDocument();
  });

  it("collapses and expands the root", () => {
    render(<JsonTree value={{ name: "DevLens" }} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Collapse root" }),
    );

    expect(screen.queryByText('"name"')).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Expand root" }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("shows empty containers clearly", () => {
    render(<JsonTree value={{}} />);

    expect(screen.getByText("Empty object.")).toBeInTheDocument();
  });

  it("labels primitive types", () => {
    render(
      <JsonTree
        value={{ text: "value", num: 1, flag: true, missing: null }}
      />,
    );

    expect(screen.getByText("string")).toBeInTheDocument();
    expect(screen.getByText("number")).toBeInTheDocument();
    expect(screen.getByText("boolean")).toBeInTheDocument();
    expect(screen.getAllByText("null").length).toBeGreaterThan(0);
  });

  it("stops expanding at the depth limit", () => {
    let value: JsonValue = 1;
    for (let depth = 0; depth < 45; depth += 1) {
      value = { child: value };
    }

    render(<JsonTree value={value} />);

    for (let depth = 0; depth < 40; depth += 1) {
      fireEvent.click(
        screen.getByRole("button", { name: /^Expand / }),
      );
    }

    expect(
      screen.getByText(/Depth limit reached at 40 levels/),
    ).toBeInTheDocument();
  });

  it("caps large child lists and reveals more on request", () => {
    render(
      <JsonTree
        value={Array.from({ length: 250 }, (_, index) => index)}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Show 100 more…" }),
    ).toBeInTheDocument();
    expect(screen.queryAllByText("150")).toHaveLength(0);

    fireEvent.click(
      screen.getByRole("button", { name: "Show 100 more…" }),
    );

    expect(screen.getAllByText("150").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Show 50 more…" }),
    ).toBeInTheDocument();
  });
});
