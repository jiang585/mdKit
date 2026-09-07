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
import { Compartment, type EditorState, type Extension, type Range } from '@codemirror/state';
import {
  Decoration,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
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

/**
 * 活动行高亮（自定义）：
 * CodeMirror 内置 highlightActiveLine 在「有选区」时也会给选区头部所在行（r.head）加一个
 * 整行 `cm-activeLine` 装饰——导致多行选区的最后一行背景铺满整行，无法精确到单个字符。
 * 这里改为：仅当该 range 为空选区（即单个光标、未划选文本）时才加整行高亮，
 * 让多行选区始终保持逐字符精确的选区背景。
 */
const mkActiveLineDeco = Decoration.line({ class: 'cm-activeLine' });
function mkActiveLine(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = this.compute(view);
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet) this.decorations = this.compute(update.view);
      }
      compute(view: EditorView): DecorationSet {
        let lastLineStart = -1;
        const deco: Range<Decoration>[] = [];
        for (const r of view.state.selection.ranges) {
          if (!r.empty) continue; // 有选区（划选了文本）则不染整行，保留逐字符选区
          const line = view.lineBlockAt(r.head);
          if (line.from > lastLineStart) {
            deco.push(mkActiveLineDeco.range(line.from));
            lastLineStart = line.from;
          }
        }
        return Decoration.set(deco);
      }
    },
    { decorations: (v) => v.decorations },
  );
}

export function buildExtensions(opts: CmSetupOptions): Extension[] {
  return [
    compartments.lineNumbers.of(opts.lineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : []),
    mkActiveLine(),
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
