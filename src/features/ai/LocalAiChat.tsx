import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  AlertIcon,
  Badge,
  Button,
  Card,
  CheckIcon,
  cn,
  CopyIcon,
  PlusIcon,
  SendIcon,
  SparklesIcon,
  StopIcon,
} from "../../components";
import { copyTextToClipboard } from "../../services/clipboard";
import { ollamaProvider } from "../../services/local-ai";
import {
  hasOriginPermission,
  requestOriginPermission,
} from "../../services/permissions";
import {
  assistContextError,
  buildDeveloperContext,
  LOCAL_AI_ASSIST_MODES,
  promptTemplatesFor,
  resolveAssistQuestion,
  type LocalAiAssistMode,
} from "./assist";
import { LocalAiAssistFields } from "./LocalAiAssistFields";
import { MarkdownMessage } from "./markdown-message";
import type { LocalAiChatMessage } from "./provider";

type MessageStatus = "complete" | "streaming" | "error" | "stopped";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: MessageStatus;
  error?: string;
}

interface CopyState {
  id: string;
  copied: boolean;
}

export interface LocalAiChatProps {
  endpoint: string | null;
  model: string | null;
  unavailableReason: string | null;
  onBusyChange: (busy: boolean) => void;
}

export function LocalAiChat({
  endpoint,
  model,
  unavailableReason,
  onBusyChange,
}: LocalAiChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<LocalAiAssistMode>("chat");
  const [templateId, setTemplateId] = useState("");
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [copyState, setCopyState] = useState<CopyState | null>(null);
  const nextIdRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (unavailableReason) {
      controllerRef.current?.abort();
    }
  }, [unavailableReason]);

  useEffect(() => {
    const element = scrollRef.current;

    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages]);

  const templates = promptTemplatesFor(mode);
  const selectedTemplate =
    templates.find((template) => template.id === templateId) ??
    templates[0] ??
    null;
  const question = draft.trim();
  const contextError = assistContextError({
    mode,
    code,
    language,
    errorMessage,
  });
  const modeDefinition =
    LOCAL_AI_ASSIST_MODES.find((item) => item.id === mode) ??
    LOCAL_AI_ASSIST_MODES[0];

  function nextId(prefix: string): string {
    nextIdRef.current += 1;
    return `${prefix}-${nextIdRef.current}`;
  }

  function updateMessage(
    id: string,
    patch: Partial<Omit<ChatMessage, "id" | "role">>,
  ) {
    setMessages((current) =>
      current.map((message) =>
        message.id === id ? { ...message, ...patch } : message,
      ),
    );
  }

  async function handleSend() {
    if (
      question.length === 0 ||
      contextError ||
      streaming ||
      unavailableReason ||
      !endpoint ||
      !model
    ) {
      return;
    }

    const history: LocalAiChatMessage[] = messages
      .filter(
        (message) =>
          message.role === "user" ||
          message.status === "complete",
      )
      .filter((message) => message.content.trim().length > 0)
      .map((message) => ({
        role: message.role,
        content: message.content,
      }));
    const developerContext = buildDeveloperContext({
      mode,
      code,
      language,
      errorMessage,
    });
    const requestMessages: LocalAiChatMessage[] = [
      ...(developerContext
        ? [{ role: "system" as const, content: developerContext }]
        : []),
      ...history,
      { role: "user", content: question },
    ];
    const userMessage: ChatMessage = {
      id: nextId("user"),
      role: "user",
      content: question,
      status: "complete",
    };
    const assistantId = nextId("assistant");
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      status: "streaming",
    };
    const controller = new AbortController();

    controllerRef.current = controller;
    setMessages((current) => [
      ...current,
      userMessage,
      assistantMessage,
    ]);
    setDraft("");
    setStreaming(true);
    setCopyState(null);
    onBusyChange(true);
    textareaRef.current?.focus();

    try {
      let permitted = false;

      try {
        permitted = await hasOriginPermission(endpoint);
      } catch {
        permitted = false;
      }

      if (!permitted) {
        let granted = false;

        try {
          granted = await requestOriginPermission(endpoint);
        } catch {
          granted = false;
        }

        if (!granted) {
          updateMessage(assistantId, {
            status: "error",
            error: "Chrome access to this local endpoint was not granted.",
          });
          return;
        }
      }

      const result = await ollamaProvider.chat({
        endpoint,
        model,
        messages: requestMessages,
        signal: controller.signal,
        onToken: (token) => {
          if (!mountedRef.current) return;

          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    content: message.content + token,
                  }
                : message,
            ),
          );
        },
      });

      if (!mountedRef.current) return;

      if (result.ok) {
        updateMessage(assistantId, {
          content: result.content,
          status: "complete",
          error: undefined,
        });
      } else {
        const stopped = result.error.code === "aborted";

        updateMessage(assistantId, {
          content: result.partialContent,
          status: stopped ? "stopped" : "error",
          error: stopped ? undefined : result.error.message,
        });
      }
    } catch {
      if (mountedRef.current) {
        updateMessage(assistantId, {
          status: "error",
          error: "The local AI request failed unexpectedly.",
        });
      }
    } finally {
      if (mountedRef.current) {
        controllerRef.current = null;
        setStreaming(false);
        onBusyChange(false);
        textareaRef.current?.focus();
      }
    }
  }

  function handleStop() {
    controllerRef.current?.abort();
  }

  function handleModeChange(nextMode: LocalAiAssistMode) {
    if (streaming) return;

    const keepDraft =
      draft.trim().length > 0 &&
      draft !== selectedTemplate?.question;

    setMode(nextMode);
    setTemplateId("");

    if (!keepDraft) {
      setDraft(resolveAssistQuestion(nextMode, "", null));
    }
  }

  function handleTemplateChange(nextTemplateId: string) {
    const template = promptTemplatesFor(mode).find(
      (item) => item.id === nextTemplateId,
    );

    setTemplateId(nextTemplateId);

    if (template) {
      setDraft(template.question);
    }
  }

  function handleNewConversation() {
    if (streaming) return;

    setMessages([]);
    setDraft("");
    setMode("chat");
    setTemplateId("");
    setCode("");
    setLanguage("");
    setErrorMessage("");
    setCopyState(null);
    textareaRef.current?.focus();
  }

  async function handleCopy(id: string, content: string) {
    const copied = await copyTextToClipboard(content);

    if (mountedRef.current) {
      setCopyState({ id, copied });
    }
  }

  function handleComposerKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void handleSend();
    }
  }

  const composerDisabled =
    Boolean(unavailableReason) || !endpoint || !model;
  const canSend =
    !composerDisabled &&
    !streaming &&
    question.length > 0 &&
    !contextError;

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-accent/25 bg-accent/10 text-accent-strong">
            <SparklesIcon className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold tracking-tight text-ink">
              Chat and code assistance
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              Messages, code, and errors stay in this tab and are sent only
              to the selected loopback model.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">In memory</Badge>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleNewConversation}
            disabled={streaming || messages.length === 0}
          >
            <PlusIcon className="size-3.5" />
            New chat
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        role="log"
        aria-label="Local AI conversation"
        aria-live="off"
        className="lens-scrollbar flex min-h-[18rem] max-h-[30rem] flex-col gap-5 overflow-y-auto rounded-xl border border-line bg-base/40 p-4"
      >
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
            <div className="grid size-11 place-items-center rounded-2xl border border-line bg-raised/60 text-faint">
              <SparklesIcon className="size-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-ink">
                {unavailableReason
                  ? "Local chat is not ready"
                  : "Start a local developer session"}
              </p>
              <p className="mt-1 max-w-sm text-xs leading-5 text-muted">
                {unavailableReason ??
                  "Ollama must be running on this machine. Ask a question or explicitly attach code and error output. Nothing is saved."}
              </p>
            </div>
          </div>
        ) : (
          messages.map((message) =>
            message.role === "user" ? (
              <div key={message.id} className="flex flex-col gap-1.5">
                <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-faint">
                  You
                </span>
                <div className="ml-auto max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md border border-accent/25 bg-accent/10 px-4 py-2.5 text-sm leading-6 text-ink">
                  {message.content}
                </div>
              </div>
            ) : (
              <div key={message.id} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-accent-strong">
                    Ollama
                  </span>
                  {message.status === "streaming" && (
                    <span
                      role="status"
                      className="text-[11px] text-faint"
                    >
                      Generating…
                    </span>
                  )}
                </div>
                <div
                  className={cn(
                    "rounded-2xl rounded-bl-md border px-4 py-3",
                    message.status === "error"
                      ? "border-danger/30 bg-danger/[0.06]"
                      : "border-line bg-raised/40",
                  )}
                >
                  {message.content.length > 0 ? (
                    <MarkdownMessage content={message.content} />
                  ) : message.status === "streaming" ? (
                    <p className="text-sm text-muted">
                      Waiting for the model…
                    </p>
                  ) : null}

                  {message.status === "error" && message.error && (
                    <div
                      role="alert"
                      className="mt-2 flex items-start gap-2 text-xs leading-5 text-danger"
                    >
                      <AlertIcon className="mt-0.5 size-3.5 shrink-0" />
                      <span>{message.error}</span>
                    </div>
                  )}

                  {message.status === "stopped" && (
                    <p className="mt-2 text-xs leading-5 text-warning">
                      Stopped. Partial output is kept in this tab.
                    </p>
                  )}

                  {message.content.length > 0 && (
                    <div className="mt-3 flex items-center gap-2 border-t border-line/70 pt-2.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          void handleCopy(message.id, message.content)
                        }
                        aria-label={
                          copyState?.id === message.id &&
                          copyState.copied
                            ? "Response copied"
                            : "Copy response"
                        }
                        className="h-7 px-2 text-[11px]"
                      >
                        {copyState?.id === message.id &&
                        copyState.copied ? (
                          <CheckIcon className="size-3.5 text-success" />
                        ) : (
                          <CopyIcon className="size-3.5" />
                        )}
                        {copyState?.id === message.id
                          ? copyState.copied
                            ? "Copied"
                            : "Copy failed"
                          : "Copy"}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ),
          )
        )}
      </div>

      {unavailableReason && messages.length > 0 && (
        <p role="status" className="text-xs leading-5 text-warning">
          {unavailableReason}
        </p>
      )}

      <LocalAiAssistFields
        mode={mode}
        onModeChange={handleModeChange}
        templateId={templateId}
        onTemplateChange={handleTemplateChange}
        code={code}
        onCodeChange={setCode}
        language={language}
        onLanguageChange={setLanguage}
        errorMessage={errorMessage}
        onErrorMessageChange={setErrorMessage}
        disabled={streaming}
        hint={contextError}
      />

      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSend();
        }}
      >
        <label htmlFor="ollama-chat-input" className="sr-only">
          Message
        </label>
        <textarea
          ref={textareaRef}
          id="ollama-chat-input"
          rows={3}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleComposerKeyDown}
          disabled={composerDisabled}
          aria-describedby="ollama-chat-help"
          placeholder={
            modeDefinition?.composerPlaceholder ??
            "Ask the selected local model…"
          }
          className={cn(
            "lens-scrollbar w-full resize-none rounded-xl border border-line bg-base/70 px-3 py-2.5 text-sm leading-6 text-ink placeholder:text-faint focus:outline-none",
            "focus:border-accent/50 focus:ring-1 focus:ring-accent/30",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p
            id="ollama-chat-help"
            className="text-[11px] leading-5 text-faint"
          >
            Enter sends · Shift+Enter adds a line. Prompts and context are
            never saved.
          </p>
          {streaming ? (
            <Button variant="secondary" onClick={handleStop}>
              <StopIcon className="size-3.5" />
              Stop
            </Button>
          ) : (
            <Button type="submit" variant="primary" disabled={!canSend}>
              <SendIcon className="size-3.5" />
              Send
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
