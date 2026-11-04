import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PopupApp } from "./PopupApp";

describe("PopupApp", () => {
  it("renders the launcher and reports an unavailable worker", async () => {
    render(<PopupApp />);

    expect(
      screen.getByRole("heading", { name: "Your API workbench" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /open workspace/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Network Inspector")).toBeInTheDocument();
    expect(await screen.findByText("Offline")).toBeInTheDocument();
  });
});
