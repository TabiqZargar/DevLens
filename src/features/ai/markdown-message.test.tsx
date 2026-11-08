import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownMessage } from "./markdown-message";

afterEach(() => {
  Reflect.deleteProperty(window.navigator, "clipboard");
});

describe("MarkdownMessage", () => {
  it("renders formatted text safely without injecting HTML", () => {
    const { container } = render(
      <MarkdownMessage
        content={[
          "# Heading",
          "",
          "Use **bold**, *italic*, and `code`.",
          "",
          "- first",
          "- second",
          "",
          "<script>alert('unsafe')</script>",
        ].join("\n")}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Heading" }),
    ).toBeInTheDocument();
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getByText("italic").tagName).toBe("EM");
    expect(screen.getByText("code").tagName).toBe("CODE");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(
      screen.getByText("<script>alert('unsafe')</script>"),
    ).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
  });

  it("copies fenced code without executing it", async () => {
    const writeText = vi.fn(async () => undefined);

    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <MarkdownMessage
        content={"```js\nconst unsafe = '<img onerror=alert(1)>';\n```"}
      />,
    );

    expect(screen.getByText("js")).toBeInTheDocument();
    expect(
      screen.getByText("const unsafe = '<img onerror=alert(1)>';"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy code" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        "const unsafe = '<img onerror=alert(1)>';",
      );
      expect(
        screen.getByRole("button", { name: "Code copied" }),
      ).toBeInTheDocument();
    });
  });
});
