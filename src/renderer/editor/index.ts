/**
 * 编辑核心模块入口（唯一公开 API —— 决策输入 §5：≤5 个核心接口）。
 * 职责：文本输入、语法高亮、光标管理、撤销重做（需求 §4.1）。
 * 不知道：文件存储方式、渲染管线、主题样式实现（仅消费 CSS 变量）。
 *
 * 公开接口：
 *   1. createEditor()        —— 创建编辑器实例（返回 EditorHandle）
 *   2. editorCommands        —— 命令注册表（菜单/快捷键路由用）
 *   3. DEFAULT_EDITOR_KEYS   —— 默认键位（设置面板展示用）
 */
import { EditorState } from '@codemirror/state';
import { EditorView, highlightActiveLineGutter, lineNumbers } from '@codemirror/view';
import { buildExtensions, buildUserKeymap, compartments } from './cm-setup';
import { editorCommands, DEFAULT_EDITOR_KEYS } from './markdown-commands';

export { editorCommands, DEFAULT_EDITOR_KEYS };

export type EditSource = 'user-input' | 'ai-apply' | 'file-load';

export interface EditorChangeEvent {
  source: EditSource;
  revision: number;
}

export interface CursorInfo {
  line: number;
  column: number;
  offset: number;
}

export interface EditorCreateOptions {
  parent: HTMLElement;
  initialText?: string;
  lineNumbers?: boolean;
  wordWrap?: boolean;
  shortcuts?: Record<string, string>;
  onContentChanged?: (event: EditorChangeEvent) => void;
  onCursorMoved?: (cursor: CursorInfo) => void;
  onScrollAnchorChanged?: (line: number) => void;
}

export interface EditorHandle {
  /** 读取全文快照（惰性调用，避免高频复制大文本 —— 决策输入 §9） */
  getText(): string;
  /** 整体替换文本（打开文件/恢复草稿）；重置撤销历史 */
  setText(text: string, source: EditSource): void;
  /** 单事务应用批量编辑（AI 写入走此通道，Ctrl+Z 一步可撤销 —— 验收标准 8） */
  applyEdits(edits: Array<{ from: number; to: number; insert: string }>, source: EditSource): void;
  getSelection(): { from: number; to: number; text: string };
  getCursor(): CursorInfo;
  /** 当前修订号（单调递增，渲染调度用） */
  getRevision(): number;
  runCommand(commandId: string): boolean;
  setOptions(opts: { lineNumbers?: boolean; wordWrap?: boolean; shortcuts?: Record<string, string> }): void;
  /** 多标签页：捕获/恢复完整编辑状态（含撤销栈与选区） */
  captureState(): unknown;
  restoreState(state: unknown): void;
  focus(): void;
  destroy(): void;
}

export function createEditor(options: EditorCreateOptions): EditorHandle {
  let revision = 0;
  let pendingSource: EditSource = 'user-input';
  let scrollRaf = 0;
  let userScrollIntentUntil = 0;

  const cursorOf = (state: EditorState): CursorInfo => {
    const head = state.selection.main.head;
    const line = state.doc.lineAt(head);
    return { line: line.number, column: head - line.from + 1, offset: head };
  };

  const makeState = (text: string): EditorState =>
    EditorState.create({
      doc: text,
      extensions: buildExtensions({
        lineNumbers: options.lineNumbers ?? true,
        wordWrap: options.wordWrap ?? true,
        shortcuts: options.shortcuts ?? {},
        onUpdate: ({ docChanged, selectionChanged, state }) => {
          if (docChanged) {
            revision += 1;
            const source = pendingSource;
            pendingSource = 'user-input';
            options.onContentChanged?.({ source, revision });
          }
          if (selectionChanged || docChanged) {
            options.onCursorMoved?.(cursorOf(state));
          }
        },
      }),
    });

  const view = new EditorView({ state: makeState(options.initialText ?? ''), parent: options.parent });
  const markUserScrollIntent = (): void => {
    userScrollIntentUntil = performance.now() + 1000;
  };
  const handleScroll = (): void => {
    if (performance.now() > userScrollIntentUntil) return;
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      const block = view.lineBlockAtHeight(Math.max(0, -view.documentTop));
      options.onScrollAnchorChanged?.(view.state.doc.lineAt(block.from).number);
    });
  };
  view.scrollDOM.addEventListener('wheel', markUserScrollIntent, { passive: true });
  view.scrollDOM.addEventListener('touchstart', markUserScrollIntent, { passive: true });
  view.scrollDOM.addEventListener('pointerdown', markUserScrollIntent, { passive: true });
  view.scrollDOM.addEventListener('scroll', handleScroll, { passive: true });

  const notifyExternalReplace = (source: EditSource): void => {
    revision += 1;
    options.onContentChanged?.({ source, revision });
    options.onCursorMoved?.(cursorOf(view.state));
  };

  return {
    getText: () => view.state.doc.toString(),
    setText(text, source) {
      // 整体替换 + 历史重置：直接换 state（打开新文件不应能撤销回旧文件）。
      // setState 不触发 updateListener，手动推进修订并通知。
      view.setState(makeState(text));
      notifyExternalReplace(source);
    },
    applyEdits(edits, source) {
      if (edits.length === 0) return;
      pendingSource = source;
      view.dispatch({
        changes: edits,
        userEvent: source === 'ai-apply' ? 'input.ai' : 'input',
        scrollIntoView: true,
      });
    },
    getSelection() {
      const { from, to } = view.state.selection.main;
      return { from, to, text: view.state.doc.sliceString(from, to) };
    },
    getCursor: () => cursorOf(view.state),
    getRevision: () => revision,
    runCommand(commandId) {
      const command = editorCommands[commandId];
      return command ? command(view) : false;
    },
    setOptions(opts) {
      const effects = [];
      if (opts.lineNumbers !== undefined) {
        effects.push(
          compartments.lineNumbers.reconfigure(
            opts.lineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : [],
          ),
        );
      }
      if (opts.wordWrap !== undefined) {
        effects.push(compartments.wrap.reconfigure(opts.wordWrap ? EditorView.lineWrapping : []));
      }
      if (opts.shortcuts !== undefined) {
        effects.push(compartments.userKeys.reconfigure(buildUserKeymap(opts.shortcuts)));
      }
      if (effects.length > 0) view.dispatch({ effects });
    },
    captureState: () => view.state,
    restoreState(state) {
      view.setState(state as EditorState);
      notifyExternalReplace('file-load');
    },
    focus: () => view.focus(),
    destroy() {
      view.scrollDOM.removeEventListener('wheel', markUserScrollIntent);
      view.scrollDOM.removeEventListener('touchstart', markUserScrollIntent);
      view.scrollDOM.removeEventListener('pointerdown', markUserScrollIntent);
      view.scrollDOM.removeEventListener('scroll', handleScroll);
      cancelAnimationFrame(scrollRaf);
      view.destroy();
    },
  };
}
