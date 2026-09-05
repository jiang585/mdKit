/**
 * 光标同步（F3.12，P2）：编辑区光标行 → 预览区最近块锚点。纯查找逻辑。
 */
import type { BlockAnchor } from '@renderer/shared/render-types';

/** 返回覆盖该行（或其上方最近）的锚点行号；无锚点返回 null */
export function findAnchorLineForCursor(anchors: readonly BlockAnchor[], cursorLine: number): number | null {
  let best: number | null = null;
  for (const anchor of anchors) {
    if (anchor.line <= cursorLine && anchor.endLine >= cursorLine) {
      // 覆盖区间的最深匹配（line 最大）
      if (best === null || anchor.line > best) best = anchor.line;
    }
  }
  if (best !== null) return best;
  for (const anchor of anchors) {
    if (anchor.line <= cursorLine && (best === null || anchor.line > best)) best = anchor.line;
  }
  return best;
}
