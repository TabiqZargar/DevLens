import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiBuilderScreen } from "./ApiBuilderScreen";

function urlInput(): HTMLInputElement {
  return screen.getByLabelText("Request URL") as HTMLInputElement;
}

function methodSelect(): HTMLSelectElement {
  return screen.getByLabelText("HTTP method") as HTMLSelectElement;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ApiBuilderScreen", () => {
  it("renders the editor, method, URL, and a disabled Send action", () => {
    render(<ApiBuilderScreen />);

    expect(
      screen.getByRole("heading", { level: 1, name: "API Builder" }),
    ).toBeInTheDocument();
    expect(methodSelect()).toHaveValue("GET");
    expect(urlInput()).toHaveValue("");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Reset" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Params" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByLabelText("Parameter key 1"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Use an absolute http:// or https:// URL. Requests are not sent in this stage.",
      ),
    ).toBeInTheDocument();
  });

  it("updates the method and URL with URL validation feedback", () => {
    render(<ApiBuilderScreen />);

    fireEvent.change(methodSelect(), { target: { value: "POST" } });
    expect(methodSelect()).toHaveValue("POST");

    fireEvent.change(urlInput(), {
      target: { value: "https://api.example.com/users" },
    });
    expect(urlInput()).toHaveValue("https://api.example.com/users");
    expect(
      screen.getByText(
        "URL format valid. Requests are not sent in this stage.",
      ),
    ).toBeInTheDocument();

    fireEvent.change(urlInput(), { target: { value: "not a url" } });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter a valid absolute URL",
    );
    expect(urlInput()).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(urlInput(), {
      target: { value: "ftp://example.com" },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Only http:// and https:// URLs are supported.",
    );
  });

  it("adds, edits, toggles, and removes query parameters", () => {
    render(<ApiBuilderScreen />);

    fireEvent.change(screen.getByLabelText("Parameter key 1"), {
      target: { value: "q" },
    });
    fireEvent.change(screen.getByLabelText("Parameter value 1"), {
      target: { value: "devlens" },
    });

    expect(screen.getByLabelText("Parameter key 1")).toHaveValue("q");
    expect(screen.getByLabelText("Parameter value 1")).toHaveValue(
      "devlens",
    );
    expect(
      screen.getByRole("button", { name: "Params" }),
    ).toHaveTextContent("1");

    const enabled = screen.getByLabelText(
      "Enable parameter 1",
    ) as HTMLInputElement;
    fireEvent.click(enabled);
    expect(enabled).not.toBeChecked();

    fireEvent.click(
      screen.getByRole("button", { name: "Add parameter" }),
    );
    expect(
      screen.getByLabelText("Parameter key 2"),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Remove parameter 1" }),
    );
    expect(
      screen.queryByLabelText("Parameter key 2"),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Remove parameter 1" }),
    );
    expect(screen.getByText("No query parameters")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Add parameter" }),
    );
    expect(
      screen.getByLabelText("Parameter key 1"),
    ).toBeInTheDocument();
  });

  it("edits request headers independently of parameters", () => {
    render(<ApiBuilderScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Headers" }));

    expect(screen.getByLabelText("Header key 1")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Header key 1"), {
      target: { value: "Authorization" },
    });
    fireEvent.change(screen.getByLabelText("Header value 1"), {
      target: { value: "Bearer token" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Add header" }));
    expect(screen.getByLabelText("Header key 2")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Headers" }),
    ).toHaveTextContent("1");

    fireEvent.click(
      screen.getByRole("button", { name: "Remove header 1" }),
    );
    expect(
      screen.queryByLabelText("Header key 2"),
    ).not.toBeInTheDocument();
  });

  it("enables the body editor only after choosing a content type", () => {
    render(<ApiBuilderScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Body" }));

    const contentType = screen.getByLabelText(
      "Content type",
    ) as HTMLSelectElement;
    const body = screen.getByLabelText(
      "Request body",
    ) as HTMLTextAreaElement;

    expect(contentType).toHaveValue("none");
    expect(body).toBeDisabled();
    expect(
      screen.getByText(
        "Choose a content type to enable the body editor.",
      ),
    ).toBeInTheDocument();

    fireEvent.change(contentType, {
      target: { value: "application/json" },
    });
    expect(body).not.toBeDisabled();

    fireEvent.change(body, {
      target: { value: '{"name":"Ada"}' },
    });
    expect(body).toHaveValue('{"name":"Ada"}');
    expect(
      screen.getByRole("button", { name: "Body" }),
    ).toHaveTextContent("1");

    fireEvent.change(contentType, { target: { value: "none" } });
    expect(body).toBeDisabled();
  });

  it("resets every field and returns to the params section", () => {
    render(<ApiBuilderScreen />);

    fireEvent.change(methodSelect(), { target: { value: "PATCH" } });
    fireEvent.change(urlInput(), {
      target: { value: "https://api.example.com" },
    });
    fireEvent.change(screen.getByLabelText("Parameter key 1"), {
      target: { value: "q" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Body" }));
    fireEvent.change(screen.getByLabelText("Content type"), {
      target: { value: "text/plain" },
    });
    fireEvent.change(screen.getByLabelText("Request body"), {
      target: { value: "hello" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(methodSelect()).toHaveValue("GET");
    expect(urlInput()).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "Params" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Parameter key 1")).toHaveValue("");
    expect(
      screen.getByText(
        "Reset the request editor. Nothing is sent or stored.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Body" }));
    expect(screen.getByLabelText("Content type")).toHaveValue("none");
    expect(screen.getByLabelText("Request body")).toBeDisabled();
    expect(screen.getByLabelText("Request body")).toHaveValue("");
  });

  it("never sends a request or touches storage", () => {
    const fetchMock = vi.fn();
    const setItem = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(),
      setItem,
      removeItem: vi.fn(),
      clear: vi.fn(),
    });

    render(<ApiBuilderScreen />);

    fireEvent.change(methodSelect(), { target: { value: "POST" } });
    fireEvent.change(urlInput(), {
      target: { value: "https://api.example.com" },
    });
    fireEvent.change(screen.getByLabelText("Parameter key 1"), {
      target: { value: "q" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add parameter" }));
    fireEvent.click(screen.getByRole("button", { name: "Headers" }));
    fireEvent.change(screen.getByLabelText("Header key 1"), {
      target: { value: "Authorization" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Body" }));
    fireEvent.change(screen.getByLabelText("Content type"), {
      target: { value: "application/json" },
    });
    fireEvent.change(screen.getByLabelText("Request body"), {
      target: { value: '{"secret":true}' },
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });
});
