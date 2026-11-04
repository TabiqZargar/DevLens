import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("renders its label and handles clicks", () => {
    const onClick = vi.fn();

    render(<Button onClick={onClick}>Open workspace</Button>);

    fireEvent.click(screen.getByRole("button", { name: "Open workspace" }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("defaults to a non-submitting button", () => {
    render(<Button>Safe action</Button>);

    expect(screen.getByRole("button", { name: "Safe action" })).toHaveAttribute(
      "type",
      "button",
    );
  });
});
