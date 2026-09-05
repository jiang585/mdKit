/**
 * 多标签页（F1.6）：切换 / 关闭（脏标记确认由上层处理）/ 新建。
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
              ×
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="mk-tab-new" aria-label="新建文档" title="新建 (Ctrl+N)" onClick={onNew}>
        ＋
      </button>
    </div>
  );
});
