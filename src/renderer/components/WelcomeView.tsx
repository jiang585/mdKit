/**
 * 空状态引导（阶段5：加载与空状态）：无标签页时展示，提供新建/打开/最近文件入口。
 */
import { memo } from 'react';
import type { RecentFile } from '@shared/ipc-contract';

export interface WelcomeViewProps {
  recentFiles: RecentFile[];
  onNew: () => void;
  onOpen: () => void;
  onOpenRecent: (path: string) => void;
  onClearRecent: () => void;
}

export const WelcomeView = memo(function WelcomeView({
  recentFiles,
  onNew,
  onOpen,
  onOpenRecent,
  onClearRecent,
}: WelcomeViewProps) {
  return (
    <div className="mk-welcome" data-testid="welcome">
      <div className="mk-welcome-card">
        <div className="mk-welcome-logo" aria-hidden>
          <span className="mk-welcome-logo-m">M↓</span>
        </div>
        <h1 className="mk-welcome-title">MD工具箱</h1>
        <p className="mk-welcome-subtitle">轻量、离线、所见即所得的 Markdown 工具箱</p>
        <div className="mk-welcome-actions">
          <button type="button" className="mk-btn mk-btn-primary" onClick={onNew}>
            新建文档 <kbd>Ctrl+N</kbd>
          </button>
          <button type="button" className="mk-btn" onClick={onOpen}>
            打开文件 <kbd>Ctrl+O</kbd>
          </button>
        </div>
        <p className="mk-welcome-drop">或将 .md 文件拖入窗口</p>
        {recentFiles.length > 0 && (
          <div className="mk-welcome-recent">
            <div className="mk-welcome-recent-head">
              <span>最近打开</span>
              <button type="button" className="mk-link-btn" onClick={onClearRecent}>
                清空
              </button>
            </div>
            {recentFiles.slice(0, 8).map((f) => (
              <button
                key={f.path}
                type="button"
                className="mk-welcome-recent-item"
                title={f.path}
                onClick={() => onOpenRecent(f.path)}
              >
                <span className="mk-welcome-recent-name">{f.name}</span>
                <span className="mk-welcome-recent-path">{f.path}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
