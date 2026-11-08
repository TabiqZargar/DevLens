import { useMemo, useState } from "react";
import {
  Button,
  CheckIcon,
  cn,
  CopyIcon,
} from "../../components";
import { copyTextToClipboard } from "../../services/clipboard";
import {
  parseInline,
  parseMarkdown,
  type InlineToken,
  type MarkdownBlock,
} from "./markdown";

type CodeBlock = Extract<MarkdownBlock, { type: "code" }>;
type CopyState = "idle" | "copied" | "failed";

function InlineTokens({ tokens }: { tokens: InlineToken[] }) {
  return (
    <>
      {tokens.map((token, index) => {
        switch (token.type) {
          case "text":
            return token.value;
          case "code":
            return (
              <code
                key={index}
                className="rounded bg-white/[0.07] px-1.5 py-0.5 font-mono text-[0.92em] text-ink"
              >
                {token.value}
              </code>
            );
          case "strong":
            return (
              <strong key={index} className="font-semibold text-ink">
                <InlineTokens tokens={token.children} />
              </strong>
            );
          case "em":
            return (
              <em key={index} className="italic">
                <InlineTokens tokens={token.children} />
              </em>
            );
        }
      })}
    </>
  );
}

function CodeBlockView({ block }: { block: CodeBlock }) {
  const [copyState, setCopyState] = useState<CopyState>("idle");

  async function handleCopy() {
    const copied = await copyTextToClipboard(block.code);
    setCopyState(copied ? "copied" : "failed");
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-base/70">
      <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
          {block.language || "code"}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void handleCopy()}
          aria-label={
            copyState === "copied" ? "Code copied" : "Copy code"
          }
          className="h-7 px-2 text-[11px]"
        >
          {copyState === "copied" ? (
            <CheckIcon className="size-3.5 text-success" />
          ) : (
            <CopyIcon className="size-3.5" />
          )}
          {copyState === "copied"
            ? "Copied"
            : copyState === "failed"
              ? "Copy failed"
              : "Copy"}
        </Button>
      </div>
      <pre className="lens-scrollbar overflow-x-auto px-4 py-3 font-mono text-[12px] leading-6 text-ink">
        <code>{block.code}</code>
      </pre>
    </div>
  );
}

function Heading({
  level,
  text,
}: {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
}) {
  const content = <InlineTokens tokens={parseInline(text)} />;
  const className = "font-semibold tracking-tight text-ink";

  switch (level) {
    case 1:
      return <h1 className={cn(className, "text-lg")}>{content}</h1>;
    case 2:
      return <h2 className={cn(className, "text-base")}>{content}</h2>;
    case 3:
      return <h3 className={cn(className, "text-sm")}>{content}</h3>;
    default:
      return (
        <h4 className={cn(className, "text-xs uppercase tracking-[0.14em]")}>
          {content}
        </h4>
      );
  }
}

export function MarkdownMessage({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const blocks = useMemo(() => parseMarkdown(content), [content]);

  return (
    <div className={cn("space-y-3 text-sm text-ink", className)}>
      {blocks.map((block, index) => {
        switch (block.type) {
          case "heading":
            return (
              <Heading
                key={index}
                level={block.level}
                text={block.text}
              />
            );
          case "paragraph":
            return (
              <p
                key={index}
                className="whitespace-pre-wrap break-words leading-6"
              >
                <InlineTokens tokens={parseInline(block.text)} />
              </p>
            );
          case "list": {
            const items = block.items.map((item, itemIndex) => (
              <li key={itemIndex} className="pl-1">
                <InlineTokens tokens={parseInline(item)} />
              </li>
            ));

            return block.ordered ? (
              <ol
                key={index}
                className="ml-5 list-decimal space-y-1.5 leading-6"
              >
                {items}
              </ol>
            ) : (
              <ul
                key={index}
                className="ml-5 list-disc space-y-1.5 leading-6"
              >
                {items}
              </ul>
            );
          }
          case "quote":
            return (
              <blockquote
                key={index}
                className="border-l-2 border-accent/50 pl-3 text-muted"
              >
                <div className="whitespace-pre-wrap leading-6">
                  <InlineTokens tokens={parseInline(block.text)} />
                </div>
              </blockquote>
            );
          case "code":
            return <CodeBlockView key={index} block={block} />;
        }
      })}
    </div>
  );
}
