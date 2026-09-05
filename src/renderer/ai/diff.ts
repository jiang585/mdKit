/**
 * 行级 Diff（F7.6）：Myers 最短编辑脚本 + 相邻变更合并。
 * 输出面向「逐块接受/拒绝」的 chunk 列表；接受集合可编译为
 * 一次事务的最小字符编辑（验收标准 7/8）。零依赖纯函数。
 */

export interface DiffChunk {
  index: number;
  kind: 'equal' | 'change';
  /** 原文起始行（0-based，含） */
  oldStart: number;
  oldLines: string[];
  /** 新文起始行（0-based，含） */
  newStart: number;
  newLines: string[];
}

const MAX_DIFF_LINES = 20000;

function splitLines(text: string): string[] {
  return text.split('\n');
}

/** Myers O((N+M)D) 最短编辑距离回溯 */
function myersOps(a: string[], b: string[]): Array<'eq' | 'del' | 'add'> {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  if (max === 0) return [];
  const offset = max;
  const size = 2 * max + 1;
  let v = new Int32Array(size);
  const trace: Int32Array[] = [];

  outer: {
    for (let d = 0; d <= max; d++) {
      trace.push(v.slice());
      const next = v.slice();
      for (let k = -d; k <= d; k += 2) {
        let x: number;
        if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) {
          x = v[offset + k + 1]; // 向下（插入 b 行）
        } else {
          x = v[offset + k - 1] + 1; // 向右（删除 a 行）
        }
        let y = x - k;
        while (x < n && y < m && a[x] === b[y]) {
          x++;
          y++;
        }
        next[offset + k] = x;
        if (x >= n && y >= m) {
          v = next;
          trace.push(v.slice());
          break outer;
        }
      }
      v = next;
    }
  }

  // 回溯
  const ops: Array<'eq' | 'del' | 'add'> = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 2; d >= 0 && (x > 0 || y > 0); d--) {
    const vd = trace[d];
    const k = x - y;
    let prevK: number;
    if (k === -d || (k !== d && vd[offset + k - 1] < vd[offset + k + 1])) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }
    const prevX = vd[offset + prevK];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      ops.push('eq');
      x--;
      y--;
    }
    if (d > 0) {
      if (x === prevX) {
        ops.push('add');
        y--;
      } else {
        ops.push('del');
        x--;
      }
    }
  }
  while (x > 0) {
    ops.push('del');
    x--;
  }
  while (y > 0) {
    ops.push('add');
    y--;
  }
  return ops.reverse();
}

/** 计算行级 chunk 序列（相邻 del/add 合并为一个 change 块） */
export function computeLineDiff(oldText: string, newText: string): DiffChunk[] {
  const a = splitLines(oldText);
  const b = splitLines(newText);

  if (a.length + b.length > MAX_DIFF_LINES) {
    // 超大文档退化为整体替换（单块，仍可整体接受/拒绝）
    if (oldText === newText) {
      return [{ index: 0, kind: 'equal', oldStart: 0, oldLines: a, newStart: 0, newLines: b }];
    }
    return [{ index: 0, kind: 'change', oldStart: 0, oldLines: a, newStart: 0, newLines: b }];
  }

  const ops = myersOps(a, b);
  const chunks: DiffChunk[] = [];
  let ai = 0;
  let bi = 0;
  let current: DiffChunk | null = null;

  const flush = (): void => {
    if (current) {
      chunks.push(current);
      current = null;
    }
  };

  for (const op of ops) {
    if (op === 'eq') {
      if (current?.kind === 'equal') {
        current.oldLines.push(a[ai]);
        current.newLines.push(b[bi]);
      } else {
        flush();
        current = {
          index: 0,
          kind: 'equal',
          oldStart: ai,
          oldLines: [a[ai]],
          newStart: bi,
          newLines: [b[bi]],
        };
      }
      ai++;
      bi++;
    } else {
      if (current?.kind !== 'change') {
        flush();
        current = { index: 0, kind: 'change', oldStart: ai, oldLines: [], newStart: bi, newLines: [] };
      }
      if (op === 'del') {
        current.oldLines.push(a[ai]);
        ai++;
      } else {
        current.newLines.push(b[bi]);
        bi++;
      }
    }
  }
  flush();
  chunks.forEach((c, i) => (c.index = i));
  return chunks;
}

/** 原文各行的起始字符偏移表（末尾追加哨兵 = 文本总长） */
export function lineOffsets(text: string): number[] {
  const offsets = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') offsets.push(i + 1);
  }
  offsets.push(text.length + 1); // 哨兵（含虚拟换行）
  return offsets;
}

/**
 * 将「已接受的变更块」编译为字符编辑集（互不重叠、升序）。
 * 全部编辑在一次编辑器事务中应用 → Ctrl+Z 一步撤销（验收标准 8）。
 */
export function buildEditsFromChunks(
  oldText: string,
  chunks: readonly DiffChunk[],
  accepted: ReadonlySet<number>,
): Array<{ from: number; to: number; insert: string }> {
  const offsets = lineOffsets(oldText);
  const totalLines = splitLines(oldText).length;
  const edits: Array<{ from: number; to: number; insert: string }> = [];

  for (const chunk of chunks) {
    if (chunk.kind !== 'change' || !accepted.has(chunk.index)) continue;
    const startLine = chunk.oldStart;
    const endLine = chunk.oldStart + chunk.oldLines.length; // 不含
    const from = offsets[startLine] ?? oldText.length;
    let to: number;
    let insert = chunk.newLines.join('\n');

    if (chunk.oldLines.length === 0) {
      // 纯插入：插到 startLine 行首；补行尾换行
      to = from;
      if (insert.length > 0) insert += '\n';
      if (startLine >= totalLines && !oldText.endsWith('\n') && oldText.length > 0) {
        // 插在文末且原文无结尾换行
        insert = '\n' + insert.slice(0, -1);
      }
    } else if (endLine >= totalLines) {
      // 删除/替换至最后一行：吃掉前导换行以免遗留空行（纯删除时）
      to = oldText.length;
      if (insert.length === 0 && from > 0) {
        edits.push({ from: from - 1, to, insert: '' });
        continue;
      }
    } else {
      to = offsets[endLine] ?? oldText.length;
      if (insert.length > 0) insert += '\n';
    }
    edits.push({ from, to, insert });
  }
  return edits.sort((x, y) => x.from - y.from);
}

/** 按接受集直接生成结果文本（预览与测试用） */
export function applyChunks(chunks: readonly DiffChunk[], accepted: ReadonlySet<number>): string {
  const out: string[] = [];
  for (const chunk of chunks) {
    if (chunk.kind === 'equal') {
      out.push(...chunk.oldLines);
    } else if (accepted.has(chunk.index)) {
      out.push(...chunk.newLines);
    } else {
      out.push(...chunk.oldLines);
    }
  }
  return out.join('\n');
}
