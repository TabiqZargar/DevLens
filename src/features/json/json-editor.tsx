import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import {
  bracketMatching,
  foldGutter,
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { Compartment, EditorState } from "@codemirror/state";
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  placeholder as placeholderExtension,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type Ref,
} from "react";

export interface JsonCodeEditorHandle {
  focus(): void;
  reveal(offset: number): void;
}

export interface JsonCodeEditorProps {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  placeholder?: string;
}

const JSON_HIGHLIGHT = HighlightStyle.define([
  { tag: tags.propertyName, color: "#a99dff" },
  { tag: [tags.string], color: "#5eead4" },
  { tag: [tags.number], color: "#fbbf24" },
  { tag: [tags.bool], color: "#fb7185" },
  { tag: [tags.null], color: "#9aa2b8" },
  {
    tag: [tags.brace, tags.squareBracket, tags.punctuation, tags.separator],
    color: "#6c7488",
  },
  { tag: tags.invalid, color: "#fb7185" },
]);

const EDITOR_THEME = EditorView.theme(
  {
    "&": {
      height: "100%",
      backgroundColor: "transparent",
      color: "#f3f4fa",
    },
    "&.cm-focused": {
      outline: "none",
      boxShadow: "inset 0 0 0 1px rgba(139, 124, 255, 0.35)",
    },
    ".cm-scroller": {
      fontFamily: "var(--font-mono)",
      fontSize: "12.5px",
      lineHeight: "1.7",
      overflow: "auto",
    },
    ".cm-content": {
      padding: "14px 0",
      caretColor: "#a99dff",
      minHeight: "100%",
    },
    ".cm-line": {
      padding: "0 16px 0 8px",
    },
    ".cm-gutters": {
      backgroundColor: "#0b0c12",
      color: "#6c7488",
      border: "0",
      paddingLeft: "6px",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      padding: "0 10px 0 4px",
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(255, 255, 255, 0.025)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "rgba(139, 124, 255, 0.08)",
      color: "#a99dff",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, .cm-content ::selection":
      {
        backgroundColor: "rgba(139, 124, 255, 0.3) !important",
      },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "#5eead4",
    },
    ".cm-foldPlaceholder": {
      backgroundColor: "#181c2c",
      border: "1px solid #232838",
      color: "#9aa2b8",
      borderRadius: "4px",
      padding: "0 4px",
    },
    ".cm-placeholder": {
      color: "#6c7488",
    },
  },
  { dark: true },
);

const BASE_EXTENSIONS = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  history(),
  foldGutter(),
  drawSelection(),
  dropCursor(),
  indentOnInput(),
  bracketMatching(),
  highlightActiveLine(),
  json(),
  syntaxHighlighting(JSON_HIGHLIGHT),
  EDITOR_THEME,
  EditorView.lineWrapping,
  keymap.of([...defaultKeymap, ...historyKeymap]),
  EditorState.tabSize.of(2),
];

export const JsonCodeEditor = forwardRef(function JsonCodeEditor(
  {
    label,
    value,
    onChange,
    readOnly = false,
    placeholder = "",
  }: JsonCodeEditorProps,
  ref: Ref<JsonCodeEditorHandle>,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const readOnlyCompartment = useRef(new Compartment()).current;
  const initialValueRef = useRef(value);
  const initialReadOnlyRef = useRef(readOnly);
  const initialLabelRef = useRef(label);
  const initialPlaceholderRef = useRef(placeholder);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const readOnlyExtensions = initialReadOnlyRef.current
      ? [EditorState.readOnly.of(true), EditorView.editable.of(false)]
      : [];

    const view = new EditorView({
      state: EditorState.create({
        doc: initialValueRef.current,
        extensions: [
          ...BASE_EXTENSIONS,
          readOnlyCompartment.of(readOnlyExtensions),
          placeholderExtension(initialPlaceholderRef.current),
          EditorView.contentAttributes.of({
            "aria-label": initialLabelRef.current,
            "aria-multiline": "true",
            autocapitalize: "off",
            autocomplete: "off",
            spellcheck: "false",
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current?.(update.state.doc.toString());
            }
          }),
        ],
      }),
      parent: host,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [readOnlyCompartment]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const current = view.state.doc.toString();
    if (current === value) return;

    const anchor = Math.min(view.state.selection.main.anchor, value.length);
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      selection: { anchor },
    });
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: readOnlyCompartment.reconfigure(
        readOnly
          ? [EditorState.readOnly.of(true), EditorView.editable.of(false)]
          : [],
      ),
    });
  }, [readOnly, readOnlyCompartment]);

  useImperativeHandle(
    ref,
    () => ({
      focus() {
        viewRef.current?.focus();
      },
      reveal(offset: number) {
        const view = viewRef.current;
        if (!view) return;

        const position = Math.max(0, Math.min(offset, view.state.doc.length));
        view.dispatch({
          selection: { anchor: position },
          effects: EditorView.scrollIntoView(position, { y: "center" }),
        });
        view.focus();
      },
    }),
    [],
  );

  return (
    <div
      ref={hostRef}
      className="h-full min-h-0 overflow-hidden [&_.cm-editor]:h-full"
    />
  );
});
