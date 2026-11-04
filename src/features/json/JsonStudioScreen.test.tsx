import { EditorView } from "@codemirror/view";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JsonStudioScreen } from "./JsonStudioScreen";

describe("JsonStudioScreen", () => {
  it("renders both editors and the empty structure state", () => {
    render(<JsonStudioScreen />);

    expect(
      screen.getByRole("heading", { level: 1, name: "JSON Studio" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "JSON input" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "JSON output" }),
    ).toBeInTheDocument();
    expect(screen.getByText("No structure yet")).toBeInTheDocument();
  });

  it("reports empty input without crashing", async () => {
    render(<JsonStudioScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Format" }));

    expect(await screen.findByText(/Input is empty/)).toBeInTheDocument();
  });

  it("formats JSON typed into the input editor", async () => {
    render(<JsonStudioScreen />);

    const input = screen.getByRole("textbox", { name: "JSON input" });
    const inputView = EditorView.findFromDOM(input);
    expect(inputView).not.toBeNull();

    act(() => {
      inputView!.dispatch({
        changes: {
          from: 0,
          to: inputView!.state.doc.length,
          insert: '{"a":1,"b":[true,null]}',
        },
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Format" }));

    const output = screen.getByRole("textbox", { name: "JSON output" });
    await waitFor(() => {
      const outputView = EditorView.findFromDOM(output);
      expect(outputView?.state.doc.toString()).toContain('"a": 1');
    });

    expect(screen.getByText("object")).toBeInTheDocument();
  });

  it("switches indentation with an accessible pressed state", () => {
    render(<JsonStudioScreen />);

    const fourSpaces = screen.getByRole("button", { name: "4 spaces" });
    expect(fourSpaces).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(fourSpaces);

    expect(
      screen.getByRole("button", { name: "4 spaces" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
