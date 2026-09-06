/**
 * 空状态引导（阶段5：加载与空状态）：无标签页时展示，提供新建/打开/最近文件入口。
 * 现代极简工作室设计：微发光几何图形、快捷键徽章与流畅交互。
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
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="8" y1="2" x2="8" y2="14" />
              <line x1="2" y1="8" x2="14" y2="8" />
            </svg>
            新建文档 <kbd>Ctrl+N</kbd>
          </button>
          <button type="button" className="mk-btn" onClick={onOpen}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M2 4a1 1 0 0 1 1-1h4l2 2h4a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4z" />
            </svg>
            打开文件 <kbd>Ctrl+O</kbd>
          </button>
        </div>
        <p className="mk-welcome-drop">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" style={{ verticalAlign: -2, marginRight: 4, opacity: 0.7 }}>
            <path d="M4 8l4 4 4-4M8 2v10" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="2" y="13" width="12" height="1" rx="0.5" fill="currentColor" />
          </svg>
          或将 .md 文件拖入窗口
        </p>
        {recentFiles.length > 0 && (
          <div className="mk-welcome-recent">
            <div className="mk-welcome-recent-head">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" opacity="0.75">
                  <circle cx="8" cy="8" r="6" />
                  <path d="M8 5v3l2 2" strokeLinecap="round" />
                </svg>
                最近打开
              </span>
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
                <span className="mk-welcome-recent-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.6">
                    <path d="M3 2h7l3 3v9H3V2z" />
                    <path d="M10 2v3h3" />
                  </svg>
                  {f.name}
                </span>
                <span className="mk-welcome-recent-path">{f.path}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
