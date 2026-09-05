import { describe, it, expect, vi } from 'vitest';
import { createRenderScheduler } from '@renderer/preview/scheduler';
import type { RenderRequest, RenderResult } from '@renderer/shared/render-types';

const resultOf = (revision: number): RenderResult => ({
  revision,
  html: `<p data-md-line="1">rev${revision}</p>`,
  anchors: [],
  toc: [],
  diagnostics: [],
  parseMs: 1,
});

describe('渲染调度器（防抖 + 修订号淘汰，决策 §6.6/§9）', () => {
  it('防抖窗口内多次 request 合并为一次渲染，且快照惰性读取', () => {
    vi.useFakeTimers();
    let revision = 0;
    const snapshots = vi.fn(() => ({ markdown: `r${revision}`, revision, docPath: null }));
    const results: number[] = [];
    const scheduler = createRenderScheduler({
      getSnapshot: snapshots as never,
      onResult: (r) => results.push(r.revision),
      debounceMs: 120,
      rendererOverride: async (req: RenderRequest) => resultOf(req.revision),
    });

    revision = 1;
    scheduler.request();
    revision = 2;
    scheduler.request();
    revision = 3;
    scheduler.request();
    expect(snapshots).toHaveBeenCalledTimes(0); // 未到触发点不读全文
    vi.advanceTimersByTime(120);
    expect(snapshots).toHaveBeenCalledTimes(1); // 只读一次，读到最新 revision=3
    vi.useRealTimers();
    return Promise.resolve().then(() => {
      expect(results).toEqual([3]);
      scheduler.dispose();
    });
  });

  it('乱序完成时丢弃过期修订（Worker 不保证完成顺序）', async () => {
    const pendings = new Map<number, (r: RenderResult) => void>();
    let revision = 0;
    const delivered: number[] = [];
    const scheduler = createRenderScheduler({
      getSnapshot: () => ({ markdown: 'x', revision, docPath: null }),
      onResult: (r) => delivered.push(r.revision),
      debounceMs: 0,
      rendererOverride: (req) =>
        new Promise<RenderResult>((resolvePromise) => pendings.set(req.revision, resolvePromise)),
    });

    revision = 1;
    scheduler.flush();
    revision = 2;
    scheduler.flush();

    // rev2 先完成，rev1 后完成 → rev1 必须被丢弃
    pendings.get(2)?.(resultOf(2));
    await Promise.resolve();
    pendings.get(1)?.(resultOf(1));
    await Promise.resolve();

    expect(delivered).toEqual([2]);
    expect(scheduler.deliveredRevision()).toBe(2);
    scheduler.dispose();
  });

  it('修订号未前进时 flush 不重复渲染', async () => {
    let calls = 0;
    const scheduler = createRenderScheduler({
      getSnapshot: () => ({ markdown: 'x', revision: 1, docPath: null }),
      onResult: () => undefined,
      debounceMs: 0,
      rendererOverride: async (req) => {
        calls += 1;
        return resultOf(req.revision);
      },
    });
    scheduler.flush();
    await Promise.resolve();
    scheduler.flush(); // revision 仍为 1 → 跳过
    await Promise.resolve();
    expect(calls).toBe(1);
    scheduler.dispose();
  });

  it('dispose 后不再交付结果', async () => {
    const pending: Array<(r: RenderResult) => void> = [];
    const delivered: number[] = [];
    const scheduler = createRenderScheduler({
      getSnapshot: () => ({ markdown: 'x', revision: 1, docPath: null }),
      onResult: (r) => delivered.push(r.revision),
      debounceMs: 0,
      rendererOverride: () => new Promise<RenderResult>((r) => pending.push(r)),
    });
    scheduler.flush();
    scheduler.dispose();
    pending.forEach((r) => r(resultOf(1)));
    await Promise.resolve();
    expect(delivered).toEqual([]);
  });
});
