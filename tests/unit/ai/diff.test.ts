import { describe, it, expect } from 'vitest';
import { applyChunks, buildEditsFromChunks, computeLineDiff } from '@renderer/ai/diff';

/** 把编辑集应用到原文（模拟编辑器单事务） */
function applyEdits(text: string, edits: Array<{ from: number; to: number; insert: string }>): string {
  let out = '';
  let cursor = 0;
  for (const edit of edits) {
    out += text.slice(cursor, edit.from) + edit.insert;
    cursor = edit.to;
  }
  return out + text.slice(cursor);
}

const acceptAll = (chunks: ReturnType<typeof computeLineDiff>): Set<number> =>
  new Set(chunks.filter((c) => c.kind === 'change').map((c) => c.index));

describe('行级 Diff（F7.6）', () => {
  it('相同文本 → 仅 equal 块', () => {
    const chunks = computeLineDiff('a\nb', 'a\nb');
    expect(chunks.every((c) => c.kind === 'equal')).toBe(true);
  });

  it('行替换合并为单个 change 块', () => {
    const chunks = computeLineDiff('a\nold\nc', 'a\nnew\nc');
    const changes = chunks.filter((c) => c.kind === 'change');
    expect(changes).toHaveLength(1);
    expect(changes[0].oldLines).toEqual(['old']);
    expect(changes[0].newLines).toEqual(['new']);
    expect(changes[0].oldStart).toBe(1);
  });

  it('纯插入与纯删除', () => {
    const ins = computeLineDiff('a\nc', 'a\nb\nc').filter((c) => c.kind === 'change');
    expect(ins[0].oldLines).toEqual([]);
    expect(ins[0].newLines).toEqual(['b']);

    const del = computeLineDiff('a\nb\nc', 'a\nc').filter((c) => c.kind === 'change');
    expect(del[0].oldLines).toEqual(['b']);
    expect(del[0].newLines).toEqual([]);
  });

  it('applyChunks 全接受还原新文，全拒绝还原原文', () => {
    const oldText = '# 标题\n\n第一段\n第二段\n';
    const newText = '# 新标题\n\n第一段\n新增段\n第二段\n';
    const chunks = computeLineDiff(oldText, newText);
    expect(applyChunks(chunks, acceptAll(chunks))).toBe(newText);
    expect(applyChunks(chunks, new Set())).toBe(oldText);
  });

  it('部分接受：仅应用勾选块', () => {
    const oldText = 'A\nB\nC';
    const newText = 'A2\nB\nC2';
    const chunks = computeLineDiff(oldText, newText);
    const changes = chunks.filter((c) => c.kind === 'change');
    expect(changes).toHaveLength(2);
    const onlyFirst = new Set([changes[0].index]);
    expect(applyChunks(chunks, onlyFirst)).toBe('A2\nB\nC');
  });
});

describe('接受集 → 单事务编辑集（验收 7/8）', () => {
  const cases: Array<[name: string, oldText: string, newText: string]> = [
    ['中段替换', 'a\nb\nc\nd', 'a\nX\nY\nd'],
    ['头部插入', 'b\nc', 'a\nb\nc'],
    ['尾部追加', 'a\nb', 'a\nb\nc'],
    ['尾行删除', 'a\nb\nc', 'a\nb'],
    ['首行删除', 'a\nb\nc', 'b\nc'],
    ['全文替换', '旧内容', '完全不同的\n新内容'],
    ['尾部带换行', 'a\nb\n', 'a\nc\n'],
    ['空文起步', '', 'hello\nworld'],
    ['清空文档', 'x\ny', ''],
  ];

  for (const [name, oldText, newText] of cases) {
    it(`${name}：edits 应用结果与全接受一致`, () => {
      const chunks = computeLineDiff(oldText, newText);
      const edits = buildEditsFromChunks(oldText, chunks, acceptAll(chunks));
      expect(applyEdits(oldText, edits)).toBe(newText);
    });
  }

  it('部分接受的编辑集与 applyChunks 结果一致', () => {
    const oldText = '1\n2\n3\n4\n5';
    const newText = '1\n二\n3\n四\n5';
    const chunks = computeLineDiff(oldText, newText);
    const changes = chunks.filter((c) => c.kind === 'change');
    const pick = new Set([changes[1].index]);
    const edits = buildEditsFromChunks(oldText, chunks, pick);
    expect(applyEdits(oldText, edits)).toBe(applyChunks(chunks, pick));
  });

  it('编辑集按 from 升序且互不重叠（可一次事务应用）', () => {
    const oldText = 'a\nb\nc\nd\ne';
    const newText = 'A\nb\nC\nd\nE';
    const chunks = computeLineDiff(oldText, newText);
    const edits = buildEditsFromChunks(oldText, chunks, acceptAll(chunks));
    for (let i = 1; i < edits.length; i++) {
      expect(edits[i].from).toBeGreaterThanOrEqual(edits[i - 1].to);
    }
  });
});
