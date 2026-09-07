import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EditorView } from '@codemirror/view';
import { EditorState, EditorSelection } from '@codemirror/state';
import { buildExtensions } from '@renderer/editor/cm-setup';

function makeEditor(doc: string): { view: EditorView; host: HTMLElement } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: buildExtensions({
        lineNumbers: true,
        wordWrap: true,
        shortcuts: {},
        onUpdate: () => {},
      }),
    }),
    parent: host,
  });
  return { view, host };
}

const DOC = [
  '## 标题一',
  '这是第一行内容，用来测试选择。',
  '这是第二行内容，用来测试选择。',
  '这是第三行内容，用来测试选择。',
  '这是第四行内容，用来测试选择。',
  '这是第五行内容，用来测试选择。',
].join('\n');

describe('活动行高亮仅在无选区时显示（修复：多行选区最后一行整行染色）', () => {
  let view: EditorView;
  let host: HTMLElement;

  beforeEach(() => {
    ({ view, host } = makeEditor(DOC));
  });

  afterEach(() => {
    view.destroy();
    host.remove();
  });

  it('无选区（单个光标）时，光标所在行有 .cm-activeLine 整行高亮', () => {
    // 模拟点击定位到第 2 行（正常编辑光标，无选区）
    const line2 = view.state.doc.line(2);
    view.dispatch({ selection: EditorSelection.single(line2.from + 3) });
    const activeLines = host.querySelectorAll('.cm-activeLine');
    expect(activeLines.length).toBeGreaterThan(0);
  });

  it('有多行选区时，不再给选区任意行加 .cm-activeLine（最后一行保持逐字符选区）', () => {
    // 选择从第 1 行较后位置 → 第 4 行中间（多行、部分选择）
    const fromLine = view.state.doc.line(1);
    const toLine = view.state.doc.line(4);
    const from = fromLine.from + 10;
    const to = toLine.from + 6;
    view.dispatch({ selection: EditorSelection.range(from, to) });
    // 有选区：不应有任何整行活动行高亮
    const activeLines = host.querySelectorAll('.cm-activeLine');
    expect(activeLines.length).toBe(0);
  });

  it('全选（跨多行）仍不显示整行活动行背景，只见选区背景', () => {
    view.dispatch({ selection: EditorSelection.range(0, view.state.doc.length) });
    const activeLines = host.querySelectorAll('.cm-activeLine');
    expect(activeLines.length).toBe(0);
  });
});
