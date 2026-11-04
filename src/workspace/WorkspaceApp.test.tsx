import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WorkspaceApp } from "./WorkspaceApp";

afterEach(() => {
  window.location.hash = "";
});

describe("WorkspaceApp", () => {
  it("renders the module selected by the hash route", () => {
    window.location.hash = "#/jwt";

    render(<WorkspaceApp />);

    expect(
      screen.getByRole("heading", { level: 1, name: "JWT Inspector" }),
    ).toBeInTheDocument();
  });

  it("falls back to JSON Studio for unknown routes", () => {
    window.location.hash = "#/does-not-exist";

    render(<WorkspaceApp />);

    expect(
      screen.getByRole("heading", { level: 1, name: "JSON Studio" }),
    ).toBeInTheDocument();
  });
});
