import { useRef, useState } from "react";
import {
  Badge,
  BracesIcon,
  Button,
  Card,
  CheckIcon,
  cn,
  CopyIcon,
  EmptyState,
  MinimizeIcon,
  Notice,
  PageHeader,
  SwapIcon,
  TrashIcon,
} from "../../components";
import { copyTextToClipboard } from "../../services/clipboard";
import { getModuleDefinition } from "../../shared/modules";
import {
  getJsonType,
  type JsonAction,
  type JsonIndent,
  type JsonResult,
  type JsonSummary,
  type JsonValue,
} from "./json-core";
import { JsonCodeEditor, type JsonCodeEditorHandle } from "./json-editor";
import { JsonTree } from "./json-tree";
import { processJson } from "./json-worker-client";

const module = getModuleDefinition("json");

interface TreeState {
  value: JsonValue;
  source: string;
  summary: JsonSummary;
}

type JsonNotice =
  | { kind: "success" | "info" | "warning"; message: string }
  | {
      kind: "error";
      message: string;
      detail: string;
      offset: number | null;
      line: number | null;
      column: number | null;
    };

type OutputMode = "formatted" | "minified" | "source";

function IndentControl({
  indent,
  disabled,
  onChange,
}: {
  indent: JsonIndent;
  disabled: boolean;
  onChange: (indent: JsonIndent) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Indentation"
      className="inline-flex rounded-md border border-line bg-base p-1"
    >
      {([2, 4] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={indent === value}
          disabled={disabled}
          onClick={() => onChange(value)}
          className={cn(
            "rounded px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50",
            indent === value
              ? "bg-raised text-ink"
              : "text-faint hover:text-muted",
          )}
        >
          {value} spaces
        </button>
      ))}
    </div>
  );
}

export function JsonStudioScreen() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [outputSource, setOutputSource] = useState("");
  const [outputIndent, setOutputIndent] = useState<JsonIndent>(2);
  const [outputMode, setOutputMode] = useState<OutputMode>("formatted");
  const [indent, setIndent] = useState<JsonIndent>(2);
  const [tree, setTree] = useState<TreeState | null>(null);
  const [pending, setPending] = useState<JsonAction | null>(null);
  const [copying, setCopying] = useState(false);
  const [notice, setNotice] = useState<JsonNotice | null>(null);

  const inputEditorRef = useRef<JsonCodeEditorHandle>(null);
  const latestInputRef = useRef("");
  const requestIdRef = useRef(0);

  const pendingAction = pending !== null;
  const staleOutput = output.length > 0 && input !== outputSource;
  const staleTree = tree !== null && input !== tree.source;

  function setInputValue(value: string) {
    if (value === latestInputRef.current) return;

    latestInputRef.current = value;
    setInput(value);
    setNotice(null);
  }

  function applyResult(
    action: JsonAction,
    source: string,
    actionIndent: JsonIndent,
    result: JsonResult,
  ) {
    if (result.ok) {
      setTree({ value: result.value, source, summary: result.summary });

      if (result.output !== null) {
        setOutput(result.output);
        setOutputSource(source);
        setOutputIndent(actionIndent);
        setOutputMode(action === "minify" ? "minified" : "formatted");
        setNotice({
          kind: "success",
          message:
            action === "format"
              ? `Formatted with ${actionIndent} spaces.`
              : "Minified JSON.",
        });
      } else {
        setNotice({ kind: "success", message: "Valid JSON." });
      }

      return;
    }

    if (result.empty) {
      setNotice({
        kind: "warning",
        message: "Input is empty. Paste JSON to format, validate, or explore.",
      });
      return;
    }

    setNotice({
      kind: "error",
      message: result.error.message,
      detail: result.error.detail,
      offset: result.error.offset,
      line: result.error.line,
      column: result.error.column,
    });

    if (result.error.offset !== null) {
      inputEditorRef.current?.reveal(result.error.offset);
    }
  }

  async function runAction(action: JsonAction) {
    if (pendingAction) return;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    const source = latestInputRef.current;
    const actionIndent = indent;
    setPending(action);
    setNotice(null);

    try {
      const result = await processJson({
        action,
        input: source,
        indent: actionIndent,
      });

      if (requestId !== requestIdRef.current) return;

      if (latestInputRef.current !== source) {
        setNotice({
          kind: "info",
          message:
            "Input changed before processing finished. Run the action again.",
        });
        return;
      }

      applyResult(action, source, actionIndent, result);
    } catch (error) {
      if (requestId !== requestIdRef.current) return;

      setNotice({
        kind: "error",
        message: "JSON processing failed unexpectedly.",
        detail: error instanceof Error ? error.message : String(error),
        offset: null,
        line: null,
        column: null,
      });
    } finally {
      if (requestId === requestIdRef.current) {
        setPending(null);
      }
    }
  }

  async function handleCopy() {
    if (output.length === 0) return;

    setCopying(true);
    const copied = await copyTextToClipboard(output);
    setCopying(false);

    if (copied) {
      setNotice({
        kind: staleOutput ? "warning" : "success",
        message: staleOutput
          ? "Copied the current output. It is stale; reformat to refresh."
          : "Copied output.",
      });
      return;
    }

    setNotice({
      kind: "error",
      message:
        "Could not copy to the clipboard. Select the output and copy it manually.",
      detail: "The Clipboard API and the legacy copy fallback both failed.",
      offset: null,
      line: null,
      column: null,
    });
  }

  function handleClear() {
    requestIdRef.current += 1;
    latestInputRef.current = "";
    setInput("");
    setOutput("");
    setOutputSource("");
    setOutputMode("formatted");
    setTree(null);
    setPending(null);
    setNotice({ kind: "info", message: "Cleared input and output." });
    inputEditorRef.current?.focus();
  }

  function handleSwap() {
    if (output.length === 0) return;

    const nextInput = output;
    const nextOutput = input;

    latestInputRef.current = nextInput;
    setInput(nextInput);
    setOutput(nextOutput);
    setOutputSource(nextInput);
    setOutputMode("source");
    setTree(null);
    setNotice({ kind: "info", message: "Swapped input and output." });
  }

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <PageHeader
        eyebrow={module.milestone}
        title={module.name}
        description="Format, minify, validate, and explore JSON locally. Payloads are processed in a worker and never leave this browser."
        actions={<Badge variant="accent">Local only</Badge>}
      />

      <Card className="flex flex-wrap items-center gap-2 p-2.5">
        <IndentControl
          indent={indent}
          disabled={pendingAction}
          onChange={setIndent}
        />

        <span className="hidden h-6 w-px bg-line sm:block" />

        <Button
          size="sm"
          variant="primary"
          onClick={() => void runAction("format")}
          disabled={pendingAction}
        >
          <BracesIcon className="size-3.5" />
          {pending === "format" ? "Formatting…" : "Format"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void runAction("minify")}
          disabled={pendingAction}
        >
          <MinimizeIcon className="size-3.5" />
          {pending === "minify" ? "Minifying…" : "Minify"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void runAction("validate")}
          disabled={pendingAction}
        >
          <CheckIcon className="size-3.5" />
          {pending === "validate" ? "Validating…" : "Validate"}
        </Button>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={handleSwap}
            disabled={pendingAction || output.length === 0}
          >
            <SwapIcon className="size-3.5" />
            Swap
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleClear}
            disabled={pendingAction || (input.length === 0 && output.length === 0)}
            className="text-danger hover:bg-danger/10 hover:text-danger"
          >
            <TrashIcon className="size-3.5" />
            Clear
          </Button>
        </div>
      </Card>

      {notice && (
        <Notice
          kind={notice.kind}
          message={notice.message}
          action={
            notice.kind === "error" && notice.offset !== null ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  inputEditorRef.current?.reveal(notice.offset ?? 0)
                }
              >
                Go to error
              </Button>
            ) : undefined
          }
        >
          {notice.kind === "error" && notice.line !== null && (
            <p className="text-xs text-muted">
              Line {notice.line}, column {notice.column}
            </p>
          )}
          {notice.kind === "error" && (
            <p
              className="line-clamp-2 text-[11px] leading-5 text-faint"
              title={notice.detail}
            >
              {notice.detail}
            </p>
          )}
        </Notice>
      )}

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <Card
          className="flex min-w-0 flex-col overflow-hidden"
          aria-busy={pendingAction}
        >
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-ink">Input</h2>
              {input.length > 0 && (
                <Badge variant="outline">
                  {input.length.toLocaleString()} chars
                </Badge>
              )}
            </div>
            <span className="text-[10px] uppercase tracking-[0.12em] text-faint">
              JSON
            </span>
          </div>

          <div className="h-[clamp(20rem,44vh,34rem)] min-h-0">
            <JsonCodeEditor
              ref={inputEditorRef}
              label="JSON input"
              value={input}
              onChange={setInputValue}
              placeholder={'Paste JSON here. Try {"hello":"world"}.'}
            />
          </div>

          <div className="flex items-center justify-between border-t border-line px-4 py-2 text-[10px] text-faint">
            <span>{staleTree ? "Tree view is stale" : "Local processing"}</span>
            <span>{indent} spaces</span>
          </div>
        </Card>

        <Card
          className={cn(
            "flex min-w-0 flex-col overflow-hidden",
            staleOutput && "border-warning/30",
          )}
          aria-busy={pendingAction}
        >
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-ink">Output</h2>
              {output.length > 0 && outputMode === "formatted" && (
                <Badge variant="outline">{outputIndent} spaces</Badge>
              )}
              {output.length > 0 && outputMode === "minified" && (
                <Badge variant="outline">minified</Badge>
              )}
              {output.length > 0 && outputMode === "source" && (
                <Badge variant="outline">source</Badge>
              )}
              {staleOutput && <Badge variant="warning">Stale</Badge>}
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void handleCopy()}
              disabled={pendingAction || copying || output.length === 0}
            >
              <CopyIcon className="size-3.5" />
              {copying ? "Copying…" : "Copy"}
            </Button>
          </div>

          <div className="h-[clamp(20rem,44vh,34rem)] min-h-0">
            <JsonCodeEditor
              label="JSON output"
              value={output}
              readOnly
              placeholder="Formatted or minified JSON appears here."
            />
          </div>

          <div className="flex items-center justify-between border-t border-line px-4 py-2 text-[10px] text-faint">
            <span>Read-only</span>
            <span>{output.length.toLocaleString()} chars</span>
          </div>
        </Card>
      </div>

      <Card className="min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">Structure</h2>
            <p className="mt-0.5 text-xs text-faint">
              Collapsible tree from the last successful parse.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {tree && (
              <>
                <Badge variant="accent">
                  root {getJsonType(tree.value)}
                </Badge>
                <Badge variant="outline">
                  {tree.summary.nodes.toLocaleString()} nodes
                </Badge>
                <Badge variant="outline">depth {tree.summary.depth}</Badge>
              </>
            )}
            {staleTree && <Badge variant="warning">Stale</Badge>}
          </div>
        </div>

        {tree ? (
          <div className="p-3 sm:p-4">
            <JsonTree key={tree.source} value={tree.value} />
          </div>
        ) : (
          <div className="grid place-items-center px-6 py-14">
            <EmptyState
              icon={<BracesIcon className="size-5" />}
              title="No structure yet"
              description="Format, minify, or validate valid JSON to inspect its shape. Keys and values stay in this browser."
            />
          </div>
        )}
      </Card>
    </section>
  );
}
