/**
 * TOC 目录导航（F3.11）：由渲染结果的标题元数据生成，点击跳转预览对应位置。
 */
import { memo } from 'react';
import type { TocItem } from '@renderer/shared/render-types';

export interface TocPanelProps {
  toc: TocItem[];
  activeLine: number | null;
  onNavigate: (line: number) => void;
  onClose: () => void;
}

export const TocPanel = memo(function TocPanel({ toc, activeLine, onNavigate, onClose }: TocPanelProps) {
  return (
    <aside className="mk-toc" data-testid="toc-panel">
      <header className="mk-toc-header">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" opacity="0.8">
            <line x1="2" y1="4" x2="14" y2="4" />
            <line x1="2" y1="8" x2="10" y2="8" />
            <line x1="2" y1="12" x2="12" y2="12" />
          </svg>
          目录
        </span>
        <button type="button" className="mk-icon-btn" aria-label="关闭目录" onClick={onClose}>
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="2" y1="2" x2="10" y2="10" />
            <line x1="10" y1="2" x2="2" y2="10" />
          </svg>
        </button>
      </header>
      {toc.length === 0 ? (
        <div className="mk-toc-empty">暂无标题</div>
      ) : (
        <nav>
          {toc.map((item) => (
            <button
              key={`${item.line}-${item.id}`}
              type="button"
              className={`mk-toc-item mk-toc-l${Math.min(item.level, 4)} ${
                activeLine !== null && item.line <= activeLine ? 'mk-toc-passed' : ''
              }`}
              title={item.text}
              onClick={() => onNavigate(item.line)}
            >
              {item.text || '（空标题）'}
            </button>
          ))}
        </nav>
      )}
    </aside>
  );
});
