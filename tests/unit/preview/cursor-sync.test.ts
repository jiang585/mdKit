import { describe, it, expect } from 'vitest';
import { findAnchorLineForCursor } from '@renderer/preview/cursor-sync';
import type { BlockAnchor } from '@renderer/shared/render-types';

const anchors: BlockAnchor[] = [
  { line: 1, endLine: 3, tag: 'h1' },
  { line: 5, endLine: 9, tag: 'ul' },
  { line: 6, endLine: 7, tag: 'li' },
  { line: 12, endLine: 12, tag: 'p' },
];

describe('光标同步定位（F3.12）', () => {
  it('覆盖区间取最深匹配（line 最大）', () => {
    expect(findAnchorLineForCursor(anchors, 6)).toBe(6);
    expect(findAnchorLineForCursor(anchors, 8)).toBe(5);
  });
  it('精确单行', () => {
    expect(findAnchorLineForCursor(anchors, 12)).toBe(12);
  });
  it('间隙行取上方最近块（行号最大的前置锚点）', () => {
    expect(findAnchorLineForCursor(anchors, 10)).toBe(6);
    expect(findAnchorLineForCursor(anchors, 99)).toBe(12);
  });
  it('文首之前无锚点返回 null', () => {
    expect(findAnchorLineForCursor([{ line: 4, endLine: 5, tag: 'p' }], 2)).toBeNull();
  });
  it('空锚点集返回 null', () => {
    expect(findAnchorLineForCursor([], 3)).toBeNull();
  });
});
