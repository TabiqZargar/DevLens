import {
  Button,
  FORM_FIELD_CLASS as FIELD_CLASS,
} from "../../components";
import {
  LOCAL_AI_ASSIST_MODES,
  promptTemplatesFor,
  type LocalAiAssistMode,
} from "./assist";

export interface LocalAiAssistFieldsProps {
  mode: LocalAiAssistMode;
  onModeChange: (mode: LocalAiAssistMode) => void;
  templateId: string;
  onTemplateChange: (templateId: string) => void;
  code: string;
  onCodeChange: (code: string) => void;
  language: string;
  onLanguageChange: (language: string) => void;
  errorMessage: string;
  onErrorMessageChange: (errorMessage: string) => void;
  disabled: boolean;
  hint: string | null;
}

export function LocalAiAssistFields({
  mode,
  onModeChange,
  templateId,
  onTemplateChange,
  code,
  onCodeChange,
  language,
  onLanguageChange,
  errorMessage,
  onErrorMessageChange,
  disabled,
  hint,
}: LocalAiAssistFieldsProps) {
  const definition =
    LOCAL_AI_ASSIST_MODES.find((item) => item.id === mode) ??
    LOCAL_AI_ASSIST_MODES[0];
  const templates = promptTemplatesFor(mode);
  const template =
    templates.find((item) => item.id === templateId) ?? templates[0];

  return (
    <div className="flex flex-col gap-3 rounded-md border border-line bg-base/40 p-3.5">
      <div>
        <p className="text-xs font-medium text-muted">Task</p>
        <div
          role="group"
          aria-label="Assistant task"
          className="mt-2 flex flex-wrap gap-2"
        >
          {LOCAL_AI_ASSIST_MODES.map((item) => (
            <Button
              key={item.id}
              type="button"
              size="sm"
              variant={item.id === mode ? "secondary" : "ghost"}
              aria-pressed={item.id === mode}
              onClick={() => onModeChange(item.id)}
              disabled={disabled}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-5 text-faint">
          {definition?.description}
        </p>
      </div>

      {mode !== "chat" && (
        <>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
            <div>
              <label
                htmlFor="ollama-assist-template"
                className="mb-1.5 block text-xs font-medium text-muted"
              >
                Prompt template
              </label>
              <select
                id="ollama-assist-template"
                value={template?.id ?? ""}
                onChange={(event) =>
                  onTemplateChange(event.target.value)
                }
                disabled={disabled}
                className={`${FIELD_CLASS} [color-scheme:dark]`}
              >
                {templates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="ollama-assist-language"
                className="mb-1.5 block text-xs font-medium text-muted"
              >
                Language
              </label>
              <input
                id="ollama-assist-language"
                value={language}
                onChange={(event) =>
                  onLanguageChange(event.target.value)
                }
                disabled={disabled}
                placeholder="Optional"
                spellCheck={false}
                autoComplete="off"
                className={`${FIELD_CLASS} font-mono text-xs`}
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="ollama-assist-code"
              className="mb-1.5 block text-xs font-medium text-muted"
            >
              Code
            </label>
            <textarea
              id="ollama-assist-code"
              rows={7}
              value={code}
              onChange={(event) => onCodeChange(event.target.value)}
              disabled={disabled}
              placeholder="Paste the code you want to explain, review, or debug…"
              spellCheck={false}
              autoComplete="off"
              className={`${FIELD_CLASS} lens-scrollbar resize-y font-mono text-xs`}
            />
          </div>

          {mode === "debug" && (
            <div>
              <label
                htmlFor="ollama-assist-error"
                className="mb-1.5 block text-xs font-medium text-muted"
              >
                Error output
              </label>
              <textarea
                id="ollama-assist-error"
                rows={4}
                value={errorMessage}
                onChange={(event) =>
                  onErrorMessageChange(event.target.value)
                }
                disabled={disabled}
                placeholder="Paste the error message or stack trace…"
                spellCheck={false}
                autoComplete="off"
                className={`${FIELD_CLASS} lens-scrollbar resize-y font-mono text-xs`}
              />
            </div>
          )}

          <p
            role={hint ? "status" : undefined}
            className={`text-[11px] leading-5 ${
              hint ? "text-warning" : "text-faint"
            }`}
          >
            {hint ??
              "Only the code and error text entered here are attached. Nothing is read from the page or other DevLens modules."}
          </p>
        </>
      )}
    </div>
  );
}
