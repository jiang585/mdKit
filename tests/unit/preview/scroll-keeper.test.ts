import { describe, it, expect } from 'vitest';
import { captureAnchor, restoreScrollTop, type BlockRect } from '@renderer/preview/scroll-keeper';

const blocks = (specs: Array<[line: number, top: number, height: number]>): BlockRect[] =>
  specs.map(([line, top, height]) => ({ line, top, height }));

describe('滚动位置保持（F3.2/U1/验收3）', () => {
  const layout = blocks([
    [1, 0, 100],
    [5, 100, 200],
    [12, 300, 150],
    [20, 450, 300],
  ]);

  it('捕获视口顶部第一个可见块与块内偏移', () => {
    const anchor = captureAnchor(150, 400, 750, layout);
    expect(anchor.line).toBe(5);
    expect(anchor.offsetInBlock).toBe(50);
    expect(anchor.atBottom).toBe(false);
  });

  it('位于顶部时锚定第一块，偏移 0', () => {
    const anchor = captureAnchor(0, 400, 750, layout);
    expect(anchor.line).toBe(1);
    expect(anchor.offsetInBlock).toBe(0);
  });

  it('同一行仍存在 → scrollTop 精确恢复（编辑中部不跳变）', () => {
    const anchor = captureAnchor(320, 400, 750, layout);
    expect(anchor.line).toBe(12);
    // 新布局：该块因上方内容增高而下移 40px
    const grown = blocks([
      [1, 0, 100],
      [5, 100, 240],
      [12, 340, 150],
      [20, 490, 300],
    ]);
    const next = restoreScrollTop(anchor, 400, 790, grown);
    expect(next).toBe(340 + (320 - 300));
  });

  it('原行号消失 → 恢复到行号最接近的块', () => {
    const anchor = captureAnchor(310, 400, 750, layout); // 锚定 line=12
    const changed = blocks([
      [1, 0, 100],
      [5, 100, 200],
      [11, 300, 90], // 12 → 11（上方删了一行）
      [20, 390, 500],
    ]);
    const next = restoreScrollTop(anchor, 400, 890, changed);
    expect(next).toBe(300 + 10);
  });

  it('贴底状态在内容增长后保持贴底', () => {
    const anchor = captureAnchor(350, 400, 750, layout);
    expect(anchor.atBottom).toBe(true);
    const taller = blocks([[1, 0, 900]]);
    expect(restoreScrollTop(anchor, 400, 900, taller)).toBe(500);
  });

  it('恢复值不越界（clamp 到内容高度）', () => {
    const anchor = captureAnchor(300, 400, 750, layout);
    const shrunk = blocks([[1, 0, 120]]);
    const next = restoreScrollTop(anchor, 400, 120, shrunk);
    expect(next).toBe(0);
  });

  it('无锚点可依时回退原 scrollTop', () => {
    const anchor = captureAnchor(50, 400, 3000, []);
    expect(anchor.line).toBe(-1);
    expect(restoreScrollTop(anchor, 400, 3000, [])).toBe(50);
  });
});
