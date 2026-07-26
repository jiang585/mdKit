/**
 * 渲染进程入口：全局错误边界 + 未捕获异常上报（开发规范 §6）。
 */
import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { bridge } from '@renderer/shared/bridge';
import { App } from './App';
import 'katex/dist/katex.min.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/preview.css';
import './styles/components.css';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    void bridge().log.rendererError(`${error.message}\n${info.componentStack ?? ''}`, error.stack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="mk-crash">
          <h1>界面发生异常</h1>
          <p>错误已写入日志。你的文档内容会定期保存为恢复草稿，重启应用可恢复。</p>
          <pre className="mk-crash-detail">{this.state.error.message}</pre>
          <button type="button" className="mk-btn mk-btn-primary" onClick={() => location.reload()}>
            重新加载界面
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

window.addEventListener('error', (event) => {
  void bridge().log.rendererError(event.message ?? '未知错误', event.error?.stack);
});
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason as Error | undefined;
  void bridge().log.rendererError(`未处理的 Promise 拒绝：${reason?.message ?? String(event.reason)}`, reason?.stack);
});

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
