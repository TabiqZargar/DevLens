import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "../../shared/constants";
import { DEFAULT_SETTINGS } from "../../shared/settings";
import { LocalAiScreen } from "./LocalAiScreen";

interface ChromeStubOptions {
  permitted?: boolean;
  grant?: boolean;
  settings?: Record<string, unknown>;
}

function stubChrome(options: ChromeStubOptions = {}) {
  const store: Record<string, unknown> = options.settings
    ? { [STORAGE_KEYS.settings]: options.settings }
    : {};
  const contains = vi.fn(async () => options.permitted ?? true);
  const request = vi.fn(async () => options.grant ?? true);
  const get = vi.fn(async (key: string) => ({
    [key]: store[key],
  }));
  const set = vi.fn(async (values: Record<string, unknown>) => {
    Object.assign(store, values);
  });

  vi.stubGlobal("chrome", {
    permissions: { contains, request },
    storage: { local: { get, set } },
  });

  return { store, contains, request, get, set };
}

function tagsResponse(models: unknown[]): Response {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => JSON.stringify({ models }),
  } as unknown as Response;
}

function endpointInput(): HTMLInputElement {
  return screen.getByLabelText("Ollama endpoint") as HTMLInputElement;
}

function checkButton(): HTMLButtonElement {
  return screen.getByRole("button", {
    name: /^(Check connection|Checking…)$/,
  }) as HTMLButtonElement;
}

async function waitForSettings() {
  await waitFor(() => {
    expect(endpointInput()).toHaveValue(
      DEFAULT_SETTINGS.ollamaEndpoint,
    );
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("LocalAiScreen", () => {
  it("renders local-only connection controls without contacting Ollama", async () => {
    stubChrome();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<LocalAiScreen />);
    await waitForSettings();

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Local AI Assistant",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Local only")).toBeInTheDocument();
    expect(endpointInput()).toHaveValue(
      DEFAULT_SETTINGS.ollamaEndpoint,
    );
    expect(checkButton()).toBeEnabled();
    expect(
      screen.getByText(
        "Check the connection to load the models installed in Ollama.",
      ),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("discovers models, persists the connection, and saves the selected model", async () => {
    const chrome = stubChrome();
    const fetchMock = vi.fn(async () =>
      tagsResponse([
        {
          name: "qwen2.5-coder:7b",
          size: 4_700_000_000,
          details: {
            parameter_size: "7B",
            quantization_level: "Q4_K_M",
          },
        },
        { name: "llama3.2:latest", size: 2_000_000_000 },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<LocalAiScreen />);
    await waitForSettings();
    fireEvent.click(checkButton());

    await screen.findByText(/Connected in/);
    expect(fetchMock).toHaveBeenCalledWith(
      `${DEFAULT_SETTINGS.ollamaEndpoint}/api/tags`,
      expect.objectContaining({
        method: "GET",
        credentials: "omit",
        redirect: "error",
      }),
    );
    await waitFor(() => {
      expect(chrome.set).toHaveBeenCalledWith({
        [STORAGE_KEYS.settings]: {
          ollamaEndpoint: DEFAULT_SETTINGS.ollamaEndpoint,
          ollamaModel: "",
        },
      });
    });

    const modelSelect = screen.getByLabelText(
      "Installed model",
    ) as HTMLSelectElement;

    expect(modelSelect).toBeEnabled();
    expect(
      screen.getByRole("option", { name: "qwen2.5-coder:7b" }),
    ).toBeInTheDocument();

    fireEvent.change(modelSelect, {
      target: { value: "qwen2.5-coder:7b" },
    });

    await waitFor(() => {
      expect(chrome.set).toHaveBeenLastCalledWith({
        [STORAGE_KEYS.settings]: {
          ollamaEndpoint: DEFAULT_SETTINGS.ollamaEndpoint,
          ollamaModel: "qwen2.5-coder:7b",
        },
      });
    });
    expect(screen.getByText("7B")).toBeInTheDocument();
    expect(screen.getByText("Q4_K_M")).toBeInTheDocument();
  });

  it("restores a persisted endpoint and selects the saved installed model", async () => {
    const chrome = stubChrome({
      settings: {
        ollamaEndpoint: "http://localhost:11434",
        ollamaModel: "llama3.2:latest",
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => tagsResponse([{ name: "llama3.2:latest" }])),
    );

    render(<LocalAiScreen />);
    await waitFor(() => {
      expect(endpointInput()).toHaveValue("http://localhost:11434");
    });
    fireEvent.click(checkButton());

    await screen.findByText(/Connected in/);
    expect(
      screen.getByLabelText("Installed model"),
    ).toHaveValue("llama3.2:latest");
    expect(chrome.contains).toHaveBeenCalledWith({
      origins: ["http://localhost/*"],
    });
    expect(chrome.set).toHaveBeenLastCalledWith({
      [STORAGE_KEYS.settings]: {
        ollamaEndpoint: "http://localhost:11434",
        ollamaModel: "llama3.2:latest",
      },
    });
  });

  it("shows a permission error without fetching when access is denied", async () => {
    const chrome = stubChrome({ permitted: false, grant: false });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<LocalAiScreen />);
    await waitForSettings();
    fireEvent.click(checkButton());

    expect(
      await screen.findByText(
        "Chrome access to this local endpoint was not granted.",
      ),
    ).toBeInTheDocument();
    expect(chrome.request).toHaveBeenCalledWith({
      origins: ["http://127.0.0.1/*"],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects remote endpoints before asking for permission or fetching", async () => {
    const chrome = stubChrome();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<LocalAiScreen />);
    await waitForSettings();
    fireEvent.change(endpointInput(), {
      target: { value: "https://api.example.com/v1" },
    });
    fireEvent.click(checkButton());

    expect(
      await screen.findByText(
        "Only loopback endpoints on localhost, 127.0.0.1, or [::1] are allowed.",
      ),
    ).toBeInTheDocument();
    expect(chrome.contains).not.toHaveBeenCalled();
    expect(chrome.request).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows an explicit empty state when no models are installed", async () => {
    stubChrome();
    vi.stubGlobal("fetch", vi.fn(async () => tagsResponse([])));

    render(<LocalAiScreen />);
    await waitForSettings();
    fireEvent.click(checkButton());

    expect(
      await screen.findByText("No models installed"),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Installed model"),
    ).not.toBeInTheDocument();
  });
});
