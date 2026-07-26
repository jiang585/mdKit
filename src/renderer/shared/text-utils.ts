/** 纯文本工具（状态栏字数统计等） */

/**
 * 字数统计：CJK 每字计 1，其余按空白分词计数（U4 状态栏）。
 */
export function countWords(text: string): number {
  if (!text) return 0;
  const cjk = text.match(/[一-鿿぀-ヿ가-힯]/g)?.length ?? 0;
  const nonCjk = text
    .replace(/[一-鿿぀-ヿ가-힯]/g, ' ')
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  return cjk + nonCjk;
}

export function fileNameOf(path: string | null, fallback = '未命名'): string {
  if (!path) return fallback;
  const m = path.replace(/\\/g, '/').split('/');
  return m[m.length - 1] || fallback;
}

let idSeq = 0;
/** 会话内单调递增 ID（避免依赖随机数，便于测试与回放） */
export function nextId(prefix: string): string {
  idSeq += 1;
  return `${prefix}-${idSeq.toString(36)}`;
}
