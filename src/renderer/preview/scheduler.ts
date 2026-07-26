/**
 * 渲染调度器：防抖（固定间隔，U2）+ 修订号淘汰（只提交最新结果，§6.6）+ Worker 生命周期。
 * 文本快照惰性拉取（回调按需读取，不随每次按键复制全文）。
 */
import { debounce, type Debounced } from '@renderer/shared/debounce';
import { RENDER_DEBOUNCE_MS } from '@shared/constants';
import type { RenderRequest, RenderResult } from '@renderer/shared/render-types';

export interface SchedulerOptions {
  /** 惰性文本源：仅在防抖触发时读取一次 */
  getSnapshot: () => { markdown: string; revision: number; docPath: string | null };
  onResult: (result: RenderResult) => void;
  onFatal?: (message: string) => void;
  debounceMs?: number;
  /** 测试注入：替代 Worker 的渲染函数 */
  rendererOverride?: (req: RenderRequest) => Promise<RenderResult>;
}

export interface RenderScheduler {
  /** 请求渲染（防抖合并） */
  request(): void;
  /** 立即渲染（打开文件/初始加载） */
  flush(): void;
  /** 已交付的最新修订号 */
  deliveredRevision(): number;
  dispose(): void;
}

export function createRenderScheduler(options: SchedulerOptions): RenderScheduler {
  const debounceMs = options.debounceMs ?? RENDER_DEBOUNCE_MS;
  let worker: Worker | null = null;
  let workerFailures = 0;
  let delivered = -1;
  let disposed = false;

  const deliver = (result: RenderResult): void => {
    if (disposed) return;
    // 淘汰过期结果：Worker 不保证完成顺序，只接收更新的修订号
    if (result.revision <= delivered) return;
    delivered = result.revision;
    options.onResult(result);
  };

  const ensureWorker = (): Worker | null => {
    if (worker) return worker;
    try {
      worker = new Worker(new URL('./worker/render.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<{ type: string; res?: RenderResult }>) => {
        if (event.data.type === 'result' && event.data.res) deliver(event.data.res);
      };
      worker.onerror = () => {
        workerFailures += 1;
        worker?.terminate();
        worker = null;
        if (workerFailures > 2) {
          options.onFatal?.('渲染线程多次崩溃，请保存文档后重启应用');
        }
      };
      return worker;
    } catch {
      // Worker 不可用（测试环境等）：走同步降级
      return null;
    }
  };

  const runRender = (): void => {
    if (disposed) return;
    const { markdown, revision, docPath } = options.getSnapshot();
    if (revision <= delivered) return;
    const req: RenderRequest = { revision, markdown, docPath };

    if (options.rendererOverride) {
      void options.rendererOverride(req).then(deliver);
      return;
    }
    const w = ensureWorker();
    if (w) {
      w.postMessage({ type: 'render', req });
    } else {
      // 动态导入管线做主线程降级（仅测试/异常场景）
      void import('./worker/pipeline').then(({ renderMarkdown }) => renderMarkdown(req).then(deliver));
    }
  };

  const debounced: Debounced<[]> = debounce(runRender, debounceMs);

  return {
    request: () => debounced(),
    flush: () => {
      debounced.cancel();
      runRender();
    },
    deliveredRevision: () => delivered,
    dispose: () => {
      disposed = true;
      debounced.cancel();
      worker?.terminate();
      worker = null;
    },
  };
}
