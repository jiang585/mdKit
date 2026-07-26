/**
 * 滚动位置保持（F3.2 / U1 / 验收标准 3）：
 * 提交新内容前记录「视口顶部第一个可见块锚点 + 块内偏移」，
 * 提交后找到相同（或最近）源码行的块，恢复 scrollTop，阅读位置不跳变。
 * 纯几何计算与 DOM 读写分离，便于单元测试。
 */

export interface BlockRect {
  /** 源码行号（data-md-line） */
  line: number;
  /** 相对滚动容器内容顶部的偏移 */
  top: number;
  height: number;
}

export interface ScrollAnchorState {
  line: number;
  /** 视口顶沿相对该块顶部的偏移（px） */
  offsetInBlock: number;
  /** 兜底：原 scrollTop（无锚点可依时使用） */
  rawScrollTop: number;
  /** 已滚动到底部时置位，恢复时保持贴底 */
  atBottom: boolean;
}

/** 提交前：根据可见块计算锚点 */
export function captureAnchor(
  scrollTop: number,
  viewportHeight: number,
  contentHeight: number,
  blocks: readonly BlockRect[],
): ScrollAnchorState {
  const atBottom = contentHeight > 0 && scrollTop + viewportHeight >= contentHeight - 4;
  // 顶部可见块：第一个「底边越过视口顶沿」的块
  for (const block of blocks) {
    if (block.top + block.height > scrollTop + 1) {
      return {
        line: block.line,
        offsetInBlock: scrollTop - block.top,
        rawScrollTop: scrollTop,
        atBottom,
      };
    }
  }
  return { line: -1, offsetInBlock: 0, rawScrollTop: scrollTop, atBottom };
}

/** 提交后：由新块布局计算应恢复的 scrollTop */
export function restoreScrollTop(
  anchor: ScrollAnchorState,
  viewportHeight: number,
  contentHeight: number,
  blocks: readonly BlockRect[],
): number {
  if (anchor.atBottom) {
    return Math.max(0, contentHeight - viewportHeight);
  }
  if (anchor.line >= 0 && blocks.length > 0) {
    // 精确行优先；否则取行号最接近的块（编辑可能已改变行结构）
    let best: BlockRect | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const block of blocks) {
      const dist = Math.abs(block.line - anchor.line);
      if (dist < bestDist || (dist === bestDist && best === null)) {
        best = block;
        bestDist = dist;
      }
      if (dist === 0) break;
    }
    if (best) {
      const target = best.top + Math.min(anchor.offsetInBlock, Math.max(0, best.height - 1));
      return clampScroll(target, viewportHeight, contentHeight);
    }
  }
  return clampScroll(anchor.rawScrollTop, viewportHeight, contentHeight);
}

function clampScroll(value: number, viewportHeight: number, contentHeight: number): number {
  return Math.max(0, Math.min(value, Math.max(0, contentHeight - viewportHeight)));
}

/* ---------- DOM 胶水 ---------- */

export function readBlockRects(container: HTMLElement): BlockRect[] {
  const nodes = container.querySelectorAll<HTMLElement>('[data-md-line]');
  const rects: BlockRect[] = [];
  const containerTop = container.getBoundingClientRect().top;
  nodes.forEach((el) => {
    const line = Number(el.dataset['mdLine']);
    if (!Number.isFinite(line)) return;
    const rect = el.getBoundingClientRect();
    rects.push({ line, top: rect.top - containerTop + container.scrollTop, height: rect.height });
  });
  return rects.sort((a, b) => a.top - b.top);
}
