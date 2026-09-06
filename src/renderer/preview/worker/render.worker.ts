/**
 * 渲染 Worker：Markdown 解析、公式与代码高亮在 Worker 线程执行，
 * 不阻塞输入线程（决策输入 §9）。Worker 不保证完成顺序，
 * 过期结果由调度器按修订号丢弃（§6.6）。
 */
import type { RenderRequest } from '@renderer/shared/render-types';
import { renderMarkdown } from './pipeline';

interface InMessage {
  type: 'render';
  req: RenderRequest;
}


self.onmessage = (event: MessageEvent<InMessage>) => {
  const msg = event.data;
  if (msg.type !== 'render') return;
  renderMarkdown(msg.req)
    .then((res) => {
      (self as unknown as Worker).postMessage({ type: 'result', res });
    })
    .catch((err: unknown) => {
      // 渲染失败必须可见（否则预览区会静默空白）：回传错误让主线程降级并上报
      const message = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
      console.error('[render.worker] 渲染失败：', message);
      (self as unknown as Worker).postMessage({ type: 'worker-error', message });
    });
};

// Worker 线程未捕获异常同样回传（import 期崩溃不经过 onmessage）
self.addEventListener('error', (event) => {
  console.error('[render.worker] Worker 异常：', event.message);
});
self.addEventListener('unhandledrejection', (event) => {
  console.error('[render.worker] 未处理的 Promise 拒绝：', String(event.reason));
});
