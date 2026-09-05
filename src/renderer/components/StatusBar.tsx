/**
 * 状态栏（U4）：行:列 | 字数 | 渲染耗时/诊断 | 自动保存指示 | 当前主题。
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
        行:{line} 列:{column}
      </span>
      <span className="mk-statusbar-item" data-testid="status-words">
        字数:{words}
      </span>
      {renderMs !== null && (
        <span
          className={`mk-statusbar-item ${renderMs > 300 ? 'mk-status-warn' : ''}`}
          title="最近一次渲染耗时"
        >
          渲染 {Math.round(renderMs)}ms
        </span>
      )}
      {diagnostics > 0 && (
        <span className="mk-statusbar-item mk-status-warn" title="渲染诊断（如公式错误）">
          ⚠ {diagnostics}
        </span>
      )}
      <span className="mk-statusbar-spacer" />
      {saving && <span className="mk-statusbar-item mk-status-saving">自动保存中…</span>}
      <span className="mk-statusbar-item" data-testid="status-theme">
        {themeName} ✓
      </span>
    </footer>
  );
});
