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
  void renderMarkdown(msg.req).then((res) => {
    (self as unknown as Worker).postMessage({ type: 'result', res });
  });
};
