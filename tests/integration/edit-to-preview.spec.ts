/**
 * 集成：编辑 → 调度 → 真实渲染管线 → 结果交付（核心链路，开发规范 §7 集成层）。
 * Worker 在 jsdom 不可用时调度器自动降级主线程渲染，覆盖同一管线代码。
 */
import { describe, it, expect } from 'vitest';
import { createRenderScheduler } from '@renderer/preview/index';
import type { RenderResult } from '@renderer/shared/render-types';

function makeHarness(initial: string) {
  let text = initial;
  let revision = 1;
  const results: RenderResult[] = [];
  let notify: (() => void) | null = null;
  const scheduler = createRenderScheduler({
    getSnapshot: () => ({ markdown: text, revision, docPath: null }),
    onResult: (r) => {
      results.push(r);
      notify?.();
    },
    debounceMs: 5,
  });
  const waitResult = (minCount: number): Promise<void> =>
    new Promise((resolvePromise) => {
      const check = (): void => {
        if (results.length >= minCount) resolvePromise();
      };
      notify = check;
      check();
    });
  return {
    scheduler,
    results,
    edit(next: string) {
      text = next;
      revision += 1;
      scheduler.request();
    },
    waitResult,
  };
}

describe('编辑 → 预览实时联动', () => {
  it('初始渲染 + 编辑后增量刷新，结果按修订号单调递增', async () => {
    const h = makeHarness('# 你好');
    h.scheduler.flush();
    await h.waitResult(1);
    expect(h.results[0].html).toContain('你好');

    h.edit('# 你好\n\n新增段落 $x^2$');
    await h.waitResult(2);
    const last = h.results[h.results.length - 1];
    expect(last.html).toContain('新增段落');
    expect(last.html).toContain('katex');
    expect(last.revision).toBeGreaterThan(h.results[0].revision);
    h.scheduler.dispose();
  });

  it('连续快速编辑合并渲染（防抖 U2），最终态一致', async () => {
    const h = makeHarness('a');
    h.scheduler.flush();
    await h.waitResult(1);
    h.edit('ab');
    h.edit('abc');
    h.edit('abcd 最终');
    await h.waitResult(2);
    const last = h.results[h.results.length - 1];
    expect(last.html).toContain('abcd 最终');
    // 三次编辑至多产生两次渲染（初始 + 合并后一次；允许中间偶发一次）
    expect(h.results.length).toBeLessThanOrEqual(3);
    h.scheduler.dispose();
  });
});
