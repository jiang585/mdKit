/**
 * 多标签页（F1.6）：切换 / 关闭（脏标记确认由上层处理）/ 新建。
 * 现代桌面端审美重构：优雅的悬浮 Tab、微交互动画与高精度 SVG 控件。
 */
import { memo } from 'react';
import type { TabInfo } from '@renderer/document/document-store';

export interface TabBarProps {
  tabs: TabInfo[];
  activeTabId: string | null;
  onActivate: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onNew: () => void;
}

export const TabBar = memo(function TabBar({ tabs, activeTabId, onActivate, onClose, onNew }: TabBarProps) {
  return (
    <div className="mk-tabbar" role="tablist" data-testid="tabbar">
      <div className="mk-tabbar-scroll">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            role="tab"
            aria-selected={tab.id === activeTabId}
            tabIndex={0}
            className={`mk-tab ${tab.id === activeTabId ? 'mk-tab-active' : ''}`}
            title={tab.path ?? '未保存'}
            onClick={() => onActivate(tab.id)}
            onKeyDown={(e) => e.key === 'Enter' && onActivate(tab.id)}
            onAuxClick={(e) => {
              if (e.button === 1) onClose(tab.id);
            }}
            data-testid={`tab-${tab.id}`}
          >
            <span className={`mk-tab-dot ${tab.dirty ? 'mk-tab-dot-dirty' : ''}`} aria-hidden />
            <span className="mk-tab-name">{tab.name}</span>
            <button
              type="button"
              className="mk-tab-close"
              aria-label={`关闭 ${tab.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.id);
              }}
            >
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="2" y1="2" x2="10" y2="10" />
                <line x1="10" y1="2" x2="2" y2="10" />
              </svg>
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="mk-tab-new" aria-label="新建文档" title="新建 (Ctrl+N)" onClick={onNew}>
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="7" y1="2" x2="7" y2="12" />
          <line x1="2" y1="7" x2="12" y2="7" />
        </svg>
      </button>
    </div>
  );
});
