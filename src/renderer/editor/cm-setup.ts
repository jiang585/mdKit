/**
 * CodeMirror 6 扩展装配（编辑核心内部实现，不对模块外暴露）。
 */
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { Compartment, type EditorState, type Extension } from '@codemirror/state';
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { editorBaseTheme, editorHighlightStyle } from './editor-theme';
import { DEFAULT_EDITOR_KEYS, editorCommands } from './markdown-commands';

export const compartments = {
  lineNumbers: new Compartment(),
  wrap: new Compartment(),
  userKeys: new Compartment(),
};

/** 链接/图片路径提示（F2.4）：在 `](` 或 `](` 内提示常用前缀与文中已出现的路径 */
function pathCompletionSource(context: CompletionContext): CompletionResult | null {
  const trigger = context.matchBefore(/\]\(([^)\s]*)$/);
  if (!trigger) return null;
  const typed = trigger.text.slice(2);
  const doc = context.state.doc.toString();
  const seen = new Set<string>();
  const re = /\]\(([^)\s]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(doc)) !== null && seen.size < 20) {
    if (m[1] && !m[1].startsWith('https://')) seen.add(m[1]);
  }
  const options = [
    ...['./', '../', 'https://', '#'].map((p) => ({ label: p, type: 'keyword' as const })),
    ...[...seen].map((p) => ({ label: p, type: 'text' as const })),
  ];
  return {
    from: trigger.from + 2,
    options,
    validFor: /^[^)\s]*$/,
    filter: typed.length > 0,
  };
}

export function buildUserKeymap(overrides: Record<string, string>): Extension {
  const bindings = Object.entries(editorCommands).map(([id, run]) => ({
    key: overrides[id] ?? DEFAULT_EDITOR_KEYS[id],
    run,
  }));
  return keymap.of(bindings.filter((b): b is { key: string; run: (typeof bindings)[number]['run'] } => Boolean(b.key)));
}

export interface CmSetupOptions {
  lineNumbers: boolean;
  wordWrap: boolean;
  shortcuts: Record<string, string>;
  onUpdate: (update: { docChanged: boolean; selectionChanged: boolean; state: EditorState }) => void;
}

export function buildExtensions(opts: CmSetupOptions): Extension[] {
  return [
    compartments.lineNumbers.of(opts.lineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : []),
    highlightActiveLine(),
    history(),
    drawSelection(),
    dropCursor(),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    autocompletion({ override: [pathCompletionSource], activateOnTyping: true }),
    highlightSelectionMatches(),
    search({ top: true }),
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    editorBaseTheme(),
    editorHighlightStyle(),
    compartments.wrap.of(opts.wordWrap ? EditorView.lineWrapping : []),
    compartments.userKeys.of(buildUserKeymap(opts.shortcuts)),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...completionKeymap,
      indentWithTab,
    ]),
    EditorView.updateListener.of((update) => {
      opts.onUpdate({
        docChanged: update.docChanged,
        selectionChanged: update.selectionSet,
        state: update.state,
      });
    }),
  ];
}
