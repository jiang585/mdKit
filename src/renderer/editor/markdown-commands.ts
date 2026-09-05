/**
 * Markdown 快捷操作（F2.5）：纯函数核心 + CodeMirror 薄胶水。
 * 纯函数只处理 (文本, 选区) → (文本, 选区)，便于单元测试。
 */
import type { EditorView } from '@codemirror/view';

export interface RangeEdit {
  /** 替换 [from, to) 为 insert */
  from: number;
  to: number;
  insert: string;
  /** 新选区（相对整篇文档） */
  selFrom: number;
  selTo: number;
}

/** 行内标记切换（**粗体** / *斜体* / `代码` / ~~删除线~~） */
export function toggleInline(doc: string, from: number, to: number, marker: string): RangeEdit {
  const len = marker.length;
  const before = doc.slice(Math.max(0, from - len), from);
  const after = doc.slice(to, to + len);
  const selected = doc.slice(from, to);

  // 情况1：选区外侧已有标记 → 移除
  if (before === marker && after === marker) {
    return {
      from: from - len,
      to: to + len,
      insert: selected,
      selFrom: from - len,
      selTo: to - len,
    };
  }
  // 情况2：选区内侧包含完整标记 → 移除
  if (selected.startsWith(marker) && selected.endsWith(marker) && selected.length >= len * 2) {
    const inner = selected.slice(len, selected.length - len);
    return { from, to, insert: inner, selFrom: from, selTo: from + inner.length };
  }
  // 情况3：包裹标记；空选区时光标落在标记之间
  const insert = `${marker}${selected}${marker}`;
  return { from, to, insert, selFrom: from + len, selTo: from + len + selected.length };
}

/** 标题级别切换：将行首 `#` 前缀设置为 level（0 表示去除标题） */
export function setHeading(doc: string, lineStart: number, lineEnd: number, level: number): RangeEdit {
  const line = doc.slice(lineStart, lineEnd);
  const rest = line.replace(/^#{1,6}\s+/, '');
  const prefix = level > 0 ? '#'.repeat(level) + ' ' : '';
  const insert = prefix + rest;
  return { from: lineStart, to: lineEnd, insert, selFrom: lineStart + insert.length, selTo: lineStart + insert.length };
}

export function tableTemplate(rows = 3, cols = 3): string {
  const header = `| ${Array.from({ length: cols }, (_, i) => `列${i + 1}`).join(' | ')} |`;
  const divider = `| ${Array.from({ length: cols }, () => '---').join(' | ')} |`;
  const body = Array.from(
    { length: rows - 1 },
    () => `| ${Array.from({ length: cols }, () => '    ').join(' | ')} |`,
  ).join('\n');
  return `${header}\n${divider}\n${body}\n`;
}

export function codeFenceTemplate(lang = ''): string {
  return '```' + lang + '\n\n```\n';
}

/** 在光标处插入块（自动补前后空行），返回编辑与光标位置 */
export function insertBlock(doc: string, pos: number, block: string, cursorOffsetInBlock: number): RangeEdit {
  const needLeadingNl = pos > 0 && doc[pos - 1] !== '\n';
  const prefix = needLeadingNl ? '\n' : '';
  const insert = prefix + block;
  const cursor = pos + prefix.length + cursorOffsetInBlock;
  return { from: pos, to: pos, insert, selFrom: cursor, selTo: cursor };
}

export function linkTemplate(text: string): { snippet: string; selStart: number; selEnd: number } {
  const label = text || '链接文字';
  const snippet = `[${label}](https://)`;
  const urlStart = 1 + label.length + 2; // "[label]("
  return { snippet, selStart: urlStart, selEnd: urlStart + 'https://'.length };
}

/* ---------- CodeMirror 胶水 ---------- */

function applyRangeEdit(view: EditorView, edit: RangeEdit): boolean {
  view.dispatch({
    changes: { from: edit.from, to: edit.to, insert: edit.insert },
    selection: { anchor: edit.selFrom, head: edit.selTo },
    userEvent: 'input.format',
    scrollIntoView: true,
  });
  view.focus();
  return true;
}

function inlineCommand(marker: string) {
  return (view: EditorView): boolean => {
    const { from, to } = view.state.selection.main;
    const doc = view.state.doc.toString();
    return applyRangeEdit(view, toggleInline(doc, from, to, marker));
  };
}

function headingCommand(level: number) {
  return (view: EditorView): boolean => {
    const pos = view.state.selection.main.head;
    const line = view.state.doc.lineAt(pos);
    return applyRangeEdit(view, setHeading(view.state.doc.toString(), line.from, line.to, level));
  };
}

function blockCommand(block: string, cursorOffset: number) {
  return (view: EditorView): boolean => {
    const pos = view.state.selection.main.head;
    return applyRangeEdit(view, insertBlock(view.state.doc.toString(), pos, block, cursorOffset));
  };
}

function linkCommand(view: EditorView): boolean {
  const { from, to } = view.state.selection.main;
  const selected = view.state.doc.sliceString(from, to);
  const { snippet, selStart, selEnd } = linkTemplate(selected);
  view.dispatch({
    changes: { from, to, insert: snippet },
    selection: { anchor: from + selStart, head: from + selEnd },
    userEvent: 'input.format',
  });
  view.focus();
  return true;
}

/** 编辑器命令注册表：命令 ID → CodeMirror 命令（快捷键可经配置重绑定，E7） */
export const editorCommands: Record<string, (view: EditorView) => boolean> = {
  'editor.bold': inlineCommand('**'),
  'editor.italic': inlineCommand('*'),
  'editor.strikethrough': inlineCommand('~~'),
  'editor.inlineCode': inlineCommand('`'),
  'editor.heading1': headingCommand(1),
  'editor.heading2': headingCommand(2),
  'editor.heading3': headingCommand(3),
  'editor.clearHeading': headingCommand(0),
  'editor.insertTable': blockCommand(tableTemplate(), tableTemplate().indexOf('列1')),
  'editor.insertCodeBlock': blockCommand(codeFenceTemplate(), 4),
  'editor.insertLink': linkCommand,
};

/** 默认编辑器快捷键（U3：沿用 VSCode 习惯，Ctrl+B 加粗、Ctrl+I 斜体） */
export const DEFAULT_EDITOR_KEYS: Record<string, string> = {
  'editor.bold': 'Mod-b',
  'editor.italic': 'Mod-i',
  'editor.strikethrough': 'Mod-Shift-x',
  'editor.inlineCode': 'Mod-e',
  'editor.heading1': 'Mod-Alt-1',
  'editor.heading2': 'Mod-Alt-2',
  'editor.heading3': 'Mod-Alt-3',
  'editor.insertTable': 'Mod-Shift-t',
  'editor.insertCodeBlock': 'Mod-Shift-c',
  'editor.insertLink': 'Mod-Shift-l',
};
