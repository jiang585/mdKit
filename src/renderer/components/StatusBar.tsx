/**
 * 状态栏（U4）：行:列 | 字数 | 渲染耗时/诊断 | 自动保存指示 | 当前主题。
 * 现代工业级排版：高质感信息胶囊、平滑呼吸态指示。
 */
import { memo } from 'react';
import { useUiStore } from './ui-store';

export const StatusBar = memo(function StatusBar() {
  const line = useUiStore((s) => s.line);
  const column = useUiStore((s) => s.column);
  const words = useUiStore((s) => s.words);
  const themeName = useUiStore((s) => s.themeName);
  const renderMs = useUiStore((s) => s.renderMs);
  const diagnostics = useUiStore((s) => s.diagnostics);
  const saving = useUiStore((s) => s.saving);

  return (
    <footer className="mk-statusbar" data-testid="statusbar">
      <span className="mk-statusbar-item" data-testid="status-cursor">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.75">
          <path d="M2 2l4.5 12 2.5-4.5 4.5-2.5L2 2z" />
        </svg>
        行:{line} 列:{column}
      </span>
      <span className="mk-statusbar-item" data-testid="status-words">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.75">
          <path d="M3 4h10M3 8h10M3 12h6" />
        </svg>
        字数:{words}
      </span>
      {renderMs !== null && (
        <span
          className={`mk-statusbar-item ${renderMs > 300 ? 'mk-status-warn' : ''}`}
          title="最近一次渲染耗时"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.75">
            <circle cx="8" cy="8" r="6" />
            <path d="M8 5v3l2 2" />
          </svg>
          渲染 {Math.round(renderMs)}ms
        </span>
      )}
      {diagnostics > 0 && (
        <span className="mk-statusbar-item mk-status-warn" title="渲染诊断（如公式错误）">
          ⚠ {diagnostics}
        </span>
      )}
      <span className="mk-statusbar-spacer" />
      {saving && (
        <span className="mk-statusbar-item mk-status-saving">
          <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'currentColor', marginRight: 4 }} />
          自动保存中…
        </span>
      )}
      <span className="mk-statusbar-item" data-testid="status-theme">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.75">
          <circle cx="8" cy="8" r="6" />
          <path d="M8 2a6 6 0 0 1 0 12V2z" fill="currentColor" />
        </svg>
        {themeName} ✓
      </span>
    </footer>
  );
});
