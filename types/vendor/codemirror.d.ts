/** CodeMirror 6 / Lezer 最小声明（覆盖本项目使用面） */

declare module '@codemirror/state' {
  export type Extension = unknown | readonly Extension[];

  export interface Line {
    from: number;
    to: number;
    number: number;
    text: string;
  }

  export interface TextDoc {
    length: number;
    lines: number;
    toString(): string;
    sliceString(from: number, to?: number): string;
    lineAt(pos: number): Line;
    line(n: number): Line;
  }

  export interface SelectionRange {
    from: number;
    to: number;
    head: number;
    anchor: number;
    empty: boolean;
  }

  export interface EditorSelection {
    main: SelectionRange;
    ranges: readonly SelectionRange[];
  }

  export interface TransactionSpec {
    changes?: { from: number; to?: number; insert?: string } | Array<{ from: number; to?: number; insert?: string }>;
    selection?: { anchor: number; head?: number };
    effects?: unknown | unknown[];
    userEvent?: string;
    scrollIntoView?: boolean;
  }

  export class EditorState {
    static create(config?: { doc?: string; extensions?: Extension }): EditorState;
    doc: TextDoc;
    selection: EditorSelection;
  }

  export class Compartment {
    of(ext: Extension): Extension;
    reconfigure(ext: Extension): unknown;
  }
}

declare module '@codemirror/view' {
  import type { EditorState, Extension, TransactionSpec } from '@codemirror/state';

  export interface ViewUpdate {
    docChanged: boolean;
    selectionSet: boolean;
    state: EditorState;
    view: EditorView;
  }

  export class EditorView {
    constructor(config?: { state?: EditorState; parent?: Element });
    state: EditorState;
    readonly scrollDOM: HTMLElement;
    readonly documentTop: number;
    lineBlockAtHeight(height: number): { from: number };
    dispatch(spec: TransactionSpec): void;
    setState(state: EditorState): void;
    focus(): void;
    destroy(): void;
    static theme(spec: Record<string, Record<string, string>>, options?: { dark?: boolean }): Extension;
    static updateListener: { of(cb: (update: ViewUpdate) => void): Extension };
    static lineWrapping: Extension;
  }

  export function lineNumbers(): Extension;
  export function highlightActiveLine(): Extension;
  export function highlightActiveLineGutter(): Extension;
  export function drawSelection(): Extension;
  export function dropCursor(): Extension;

  export interface KeyBinding {
    key?: string;
    mac?: string;
    run?: (view: EditorView) => boolean;
    preventDefault?: boolean;
  }
  export const keymap: { of(bindings: readonly KeyBinding[]): Extension };
}

declare module '@codemirror/commands' {
  import type { Extension } from '@codemirror/state';
  import type { KeyBinding } from '@codemirror/view';
  export function history(): Extension;
  export const defaultKeymap: readonly KeyBinding[];
  export const historyKeymap: readonly KeyBinding[];
  export const indentWithTab: KeyBinding;
}

declare module '@codemirror/language' {
  import type { Extension } from '@codemirror/state';
  export function indentOnInput(): Extension;
  export function bracketMatching(): Extension;
  export function syntaxHighlighting(style: unknown, options?: { fallback?: boolean }): Extension;
  export const HighlightStyle: {
    define(specs: Array<Record<string, unknown>>): unknown;
  };
  export class LanguageDescription {}
}

declare module '@codemirror/search' {
  import type { Extension } from '@codemirror/state';
  import type { KeyBinding } from '@codemirror/view';
  export function search(config?: { top?: boolean }): Extension;
  export function highlightSelectionMatches(): Extension;
  export const searchKeymap: readonly KeyBinding[];
}

declare module '@codemirror/autocomplete' {
  import type { Extension, EditorState } from '@codemirror/state';
  import type { KeyBinding } from '@codemirror/view';

  export interface CompletionContext {
    state: EditorState;
    pos: number;
    matchBefore(re: RegExp): { from: number; to: number; text: string } | null;
  }
  export interface Completion {
    label: string;
    type?: string;
    apply?: string;
  }
  export interface CompletionResult {
    from: number;
    options: readonly Completion[];
    validFor?: RegExp;
    filter?: boolean;
  }
  export function autocompletion(config?: {
    override?: Array<(context: CompletionContext) => CompletionResult | null>;
    activateOnTyping?: boolean;
  }): Extension;
  export function closeBrackets(): Extension;
  export const closeBracketsKeymap: readonly KeyBinding[];
  export const completionKeymap: readonly KeyBinding[];
}

declare module '@codemirror/lang-markdown' {
  import type { Extension } from '@codemirror/state';
  import type { LanguageDescription } from '@codemirror/language';
  export function markdown(config?: {
    base?: unknown;
    codeLanguages?: readonly LanguageDescription[];
    extensions?: unknown[];
  }): Extension;
  export const markdownLanguage: unknown;
}

declare module '@codemirror/language-data' {
  import type { LanguageDescription } from '@codemirror/language';
  export const languages: readonly LanguageDescription[];
}

declare module '@lezer/highlight' {
  export type Tag = { readonly __tag: true };
  type TagFn = (tag: Tag) => Tag;
  export const tags: {
    heading1: Tag; heading2: Tag; heading3: Tag; heading4: Tag; heading5: Tag; heading6: Tag;
    strong: Tag; emphasis: Tag; strikethrough: Tag; link: Tag; url: Tag; monospace: Tag;
    quote: Tag; meta: Tag; processingInstruction: Tag; punctuation: Tag; contentSeparator: Tag;
    list: Tag; labelName: Tag; keyword: Tag; operatorKeyword: Tag; string: Tag; comment: Tag;
    lineComment: Tag; blockComment: Tag; number: Tag; bool: Tag; atom: Tag; typeName: Tag;
    className: Tag; variableName: Tag;
    special: TagFn;
    function: TagFn;
    definition: TagFn;
  };
}

declare module '@lezer/common' {
  export class Tree {}
}

declare module '@lezer/markdown' {
  export const GFM: unknown;
}
