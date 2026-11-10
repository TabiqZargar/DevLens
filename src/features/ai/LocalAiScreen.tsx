import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertIcon,
  Badge,
  Button,
  Card,
  CheckIcon,
  cn,
  DENSE_FIELD_CLASS as FIELD_CLASS,
  FIELD_FOCUS,
  LockIcon,
  PageHeader,
  SparklesIcon,
  Spinner,
} from "../../components";
import { getModuleDefinition } from "../../shared/modules";
import {
  DEFAULT_SETTINGS,
  type DevLensSettings,
} from "../../shared/settings";
import { ollamaProvider } from "../../services/local-ai";
import {
  hasOriginPermission,
  requestOriginPermission,
} from "../../services/permissions";
import { loadSettings, saveSettings } from "../../services/settings";
import { LocalAiChat } from "./LocalAiChat";
import { validateOllamaEndpoint } from "./ollama";
import type {
  LocalAiConnectionError,
  LocalAiModel,
} from "./provider";

const module = getModuleDefinition("ai");

type ConnectionState =
  | { phase: "idle" }
  | { phase: "checking" }
  | {
      phase: "connected";
      endpoint: string;
      models: LocalAiModel[];
      durationMs: number;
    }
  | { phase: "error"; error: LocalAiConnectionError };

function formatBytes(bytes: number | undefined): string | null {
  if (bytes === undefined) return null;
  if (bytes < 1024) return `${bytes} B`;

  const megabytes = bytes / (1024 * 1024);

  if (megabytes < 1024) {
    return `${megabytes.toFixed(megabytes >= 10 ? 0 : 1)} MB`;
  }

  return `${(megabytes / 1024).toFixed(1)} GB`;
}

function formatModified(value: string | undefined): string | null {
  if (!value) return null;

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function sortedModels(models: readonly LocalAiModel[]): LocalAiModel[] {
  return [...models].sort((a, b) => a.name.localeCompare(b.name));
}

function errorHint(error: LocalAiConnectionError): string | null {
  switch (error.code) {
    case "permission-denied":
      return "Chrome must grant access to the loopback origin. Check the connection again and allow the prompt.";
    case "network-error":
      return "Confirm Ollama is running at this endpoint and allows this extension origin.";
    case "timeout":
      return "Confirm Ollama is responsive, then try again.";
    case "invalid-response":
      return "Confirm the URL points to the Ollama HTTP API.";
    case "invalid-endpoint":
    case "http-error":
    case "response-too-large":
      return null;
  }
}

function ConnectionBadge({
  connection,
}: {
  connection: ConnectionState;
}) {
  switch (connection.phase) {
    case "checking":
      return <Badge variant="accent">Checking</Badge>;
    case "connected":
      return <Badge variant="success">Connected</Badge>;
    case "error":
      return <Badge variant="warning">Unavailable</Badge>;
    default:
      return <Badge variant="outline">Not checked</Badge>;
  }
}

function ConnectionSummary({
  connection,
}: {
  connection: ConnectionState;
}) {
  if (connection.phase === "checking") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 border-t border-line pt-4 text-sm text-muted"
      >
        <Spinner className="text-accent-strong" />
        Checking the local endpoint and reading installed models…
      </div>
    );
  }

  if (connection.phase === "connected") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-start gap-2 border-t border-line pt-4 text-sm text-muted"
      >
        <CheckIcon className="mt-0.5 size-4 shrink-0 text-success" />
        <div>
          <p className="text-ink">
            Connected in {connection.durationMs} ms.{" "}
            {connection.models.length === 1
              ? "1 model is installed."
              : `${connection.models.length} models are installed.`}
          </p>
          <p className="mt-1 break-all font-mono text-[11px] text-faint">
            {connection.endpoint}
          </p>
        </div>
      </div>
    );
  }

  if (connection.phase === "error") {
    if (connection.error.code === "invalid-endpoint") {
      return (
        <p className="border-t border-line pt-4 text-sm leading-6 text-muted">
          Fix the endpoint above, then check the connection again.
        </p>
      );
    }

    const hint = errorHint(connection.error);

    return (
      <div
        role="alert"
        className="flex items-start gap-2 border-t border-line pt-4 text-sm"
      >
        <AlertIcon className="mt-0.5 size-4 shrink-0 text-warning" />
        <div>
          <p className="text-ink">{connection.error.message}</p>
          {hint && (
            <p className="mt-1 text-xs leading-5 text-muted">{hint}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <p className="border-t border-line pt-4 text-sm leading-6 text-muted">
      Not checked yet. DevLens has not made a request to this endpoint.
    </p>
  );
}

function ModelDetail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.14em] text-faint">
        {label}
      </dt>
      <dd className="mt-0.5 break-all font-mono text-xs leading-5 text-ink">
        {value}
      </dd>
    </div>
  );
}

export function LocalAiScreen() {
  const [settings, setSettings] = useState<DevLensSettings>({
    ...DEFAULT_SETTINGS,
  });
  const [endpointDraft, setEndpointDraft] = useState(
    DEFAULT_SETTINGS.ollamaEndpoint,
  );
  const [connection, setConnection] = useState<ConnectionState>({
    phase: "idle",
  });
  const [settingsNotice, setSettingsNotice] = useState<string | null>(
    null,
  );
  const [loaded, setLoaded] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const busyRef = useRef(false);
  const validation = useMemo(
    () => validateOllamaEndpoint(endpointDraft),
    [endpointDraft],
  );
  const endpointError =
    endpointDraft.trim().length > 0 && !validation.ok
      ? validation.message
      : null;
  const checking = connection.phase === "checking";
  const availableModels = useMemo(
    () =>
      connection.phase === "connected"
        ? sortedModels(connection.models)
        : [],
    [connection],
  );
  const selectedModel =
    availableModels.find(
      (model) => model.name === settings.ollamaModel,
    ) ?? null;
  const savedModelMissing =
    connection.phase === "connected" &&
    settings.ollamaModel.length > 0 &&
    selectedModel === null;
  const chatEndpoint =
    connection.phase === "connected" ? connection.endpoint : null;
  const chatModel = selectedModel?.name ?? null;
  const chatUnavailableReason =
    connection.phase === "checking"
      ? "Wait for the connection check to finish."
      : connection.phase !== "connected"
        ? "Check the connection to Ollama before starting a chat."
        : availableModels.length === 0
          ? "Install an Ollama model, then check the connection again."
          : selectedModel === null
            ? "Select an installed model to start chatting."
            : null;

  useEffect(() => {
    let active = true;

    void loadSettings()
      .then((stored) => {
        if (!active) return;
        setSettings(stored);
        setEndpointDraft(stored.ollamaEndpoint);
        setLoaded(true);
      })
      .catch(() => {
        if (!active) return;
        setLoaded(true);
        setSettingsNotice("Settings could not be loaded.");
      });

    return () => {
      active = false;
    };
  }, []);

  async function persistSettings(
    next: DevLensSettings,
  ): Promise<void> {
    try {
      await saveSettings(next);
      setSettingsNotice(null);
    } catch {
      setSettingsNotice("Settings could not be saved.");
    }
  }

  function handleEndpointChange(value: string) {
    if (busyRef.current || chatBusy) return;
    setEndpointDraft(value);
    setConnection({ phase: "idle" });
    setSettingsNotice(null);
  }

  function handleModelChange(value: string) {
    if (chatBusy) return;

    if (!availableModels.some((model) => model.name === value)) {
      return;
    }

    const next: DevLensSettings = {
      ...settings,
      ollamaModel: value,
    };
    setSettings(next);
    void persistSettings(next);
  }

  async function handleCheckConnection() {
    if (busyRef.current || chatBusy) return;

    const result = validateOllamaEndpoint(endpointDraft);

    if (!result.ok) {
      setConnection({
        phase: "error",
        error: { code: "invalid-endpoint", message: result.message },
      });
      return;
    }

    busyRef.current = true;
    const endpoint = result.endpoint;
    const nextSettings: DevLensSettings = {
      ollamaEndpoint: endpoint,
      ollamaModel:
        settings.ollamaEndpoint === endpoint
          ? settings.ollamaModel
          : "",
    };

    setEndpointDraft(endpoint);
    setSettings(nextSettings);
    setConnection({ phase: "checking" });
    setSettingsNotice(null);

    const savePromise = persistSettings(nextSettings);

    try {
      let permitted = false;

      try {
        permitted = await hasOriginPermission(endpoint);
      } catch {
        permitted = false;
      }

      if (!permitted) {
        const granted = await requestOriginPermission(endpoint);

        if (!granted) {
          setConnection({
            phase: "error",
            error: {
              code: "permission-denied",
              message:
                "Chrome access to this local endpoint was not granted.",
            },
          });
          return;
        }
      }

      const response = await ollamaProvider.checkConnection(endpoint);

      if (response.ok) {
        setConnection({
          phase: "connected",
          endpoint: response.endpoint,
          models: response.models,
          durationMs: response.durationMs,
        });
      } else {
        setConnection({ phase: "error", error: response.error });
      }
    } finally {
      await savePromise;
      busyRef.current = false;
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow={module.milestone}
        title={module.name}
        description="Connect to Ollama and chat with an installed model. Connection checks, model discovery, prompts, and responses stay on loopback."
        actions={<Badge variant="accent">Local only</Badge>}
      />

      <Card className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-accent/25 bg-accent/10 text-accent-strong">
              <SparklesIcon className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight text-ink">
                Ollama connection
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                Check the local HTTP API and discover installed models.
              </p>
            </div>
          </div>
          <ConnectionBadge connection={connection} />
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div>
            <label
              htmlFor="ollama-endpoint"
              className="mb-1.5 block text-xs font-medium text-muted"
            >
              Ollama endpoint
            </label>
            <input
              id="ollama-endpoint"
              type="url"
              inputMode="url"
              value={endpointDraft}
              onChange={(event) =>
                handleEndpointChange(event.target.value)
              }
              disabled={!loaded || checking || chatBusy}
              aria-invalid={endpointError ? true : undefined}
              aria-describedby="ollama-endpoint-help"
              placeholder={DEFAULT_SETTINGS.ollamaEndpoint}
              spellCheck={false}
              autoComplete="off"
              className={cn(
                FIELD_CLASS,
                FIELD_FOCUS,
                "w-full",
                endpointError ? "border-danger/60" : "border-line",
              )}
            />
            <p
              id="ollama-endpoint-help"
              role={endpointError ? "alert" : undefined}
              className={cn(
                "mt-1.5 text-[11px] leading-5",
                endpointError ? "text-danger" : "text-faint",
              )}
            >
              {endpointError ??
                "Only loopback HTTP(S) endpoints are accepted. Chrome asks for access to this origin when you check."}
            </p>
          </div>

          <Button
            variant="primary"
            onClick={() => void handleCheckConnection()}
            disabled={!loaded || checking || chatBusy}
            aria-busy={checking}
          >
            {checking ? (
              <Spinner />
            ) : (
              <CheckIcon className="size-3.5" />
            )}
            {checking ? "Checking…" : "Check connection"}
          </Button>
        </div>

        {settingsNotice && (
          <p role="status" className="text-xs text-warning">
            {settingsNotice}
          </p>
        )}

        <ConnectionSummary connection={connection} />
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-ink">
            Model
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted">
            Choose which installed model should answer local chat messages.
          </p>
        </div>

        {connection.phase !== "connected" ? (
          <p className="rounded-xl border border-line bg-base/40 px-4 py-3 text-sm text-muted">
            Check the connection to load the models installed in Ollama.
          </p>
        ) : availableModels.length === 0 ? (
          <div className="rounded-xl border border-line bg-base/40 px-4 py-3">
            <p className="text-sm font-medium text-ink">
              No models installed
            </p>
            <p className="mt-1 text-xs leading-5 text-muted">
              Install one with{" "}
              <code className="rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[11px] text-ink">
                ollama pull &lt;model&gt;
              </code>
              , then check the connection again.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)]">
              <div>
                <label
                  htmlFor="ollama-model"
                  className="mb-1.5 block text-xs font-medium text-muted"
                >
                  Installed model
                </label>
                <select
                  id="ollama-model"
                  value={selectedModel?.name ?? ""}
                  onChange={(event) =>
                    handleModelChange(event.target.value)
                  }
                  disabled={chatBusy}
                  className={cn(
                    FIELD_CLASS,
                    FIELD_FOCUS,
                    "w-full border-line [color-scheme:dark]",
                  )}
                >
                  <option value="">Select a model</option>
                  {availableModels.map((model) => (
                    <option key={model.name} value={model.name}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {savedModelMissing && (
              <p role="status" className="text-xs text-warning">
                The saved model “{settings.ollamaModel}” is not
                installed at this endpoint.
              </p>
            )}

            {selectedModel ? (
              <dl className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
                <ModelDetail
                  label="Model"
                  value={selectedModel.name}
                />
                {selectedModel.parameterSize && (
                  <ModelDetail
                    label="Parameters"
                    value={selectedModel.parameterSize}
                  />
                )}
                {selectedModel.quantizationLevel && (
                  <ModelDetail
                    label="Quantization"
                    value={selectedModel.quantizationLevel}
                  />
                )}
                {formatBytes(selectedModel.sizeBytes) && (
                  <ModelDetail
                    label="Disk size"
                    value={formatBytes(selectedModel.sizeBytes) ?? ""}
                  />
                )}
                {formatModified(selectedModel.modifiedAt) && (
                  <ModelDetail
                    label="Modified"
                    value={
                      formatModified(selectedModel.modifiedAt) ?? ""
                    }
                  />
                )}
              </dl>
            ) : (
              <p className="text-xs leading-5 text-faint">
                Select a model to store it as the default. No model is
                assumed before you choose one.
              </p>
            )}
          </>
        )}
      </Card>

      <LocalAiChat
        endpoint={chatEndpoint}
        model={chatModel}
        unavailableReason={chatUnavailableReason}
        onBusyChange={setChatBusy}
      />

      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-raised/60 text-muted">
            <LockIcon className="size-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-ink">
              Local-only boundary
            </h2>
            <ul className="mt-3 grid gap-2 text-xs leading-5 text-muted">
              <li>
                DevLens contacts only the loopback endpoint above. The
                endpoint and selected model are stored; conversation
                messages stay in memory for this tab and are never
                saved.
              </li>
              <li>
                No cloud AI provider, API key, telemetry, page data, or
                network capture is sent to Ollama. Prompts and replies
                go only to the selected local model.
              </li>
              <li>
                If Chrome blocks the request, restart Ollama with{" "}
                <code className="rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[11px] text-ink">
                  OLLAMA_ORIGINS=chrome-extension://*
                </code>{" "}
                so the extension origin is allowed.
              </li>
            </ul>
          </div>
        </div>
      </Card>
    </section>
  );
}
