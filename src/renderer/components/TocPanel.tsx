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
        <span>目录</span>
        <button type="button" className="mk-icon-btn" aria-label="关闭目录" onClick={onClose}>
          ×
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
