/** 全局提示浮层 */
import { memo } from 'react';
import { useToastStore } from './ui-store';

const ICONS = { info: 'ℹ', success: '✓', warning: '⚠', error: '✕' } as const;

export const ToastHost = memo(function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  if (toasts.length === 0) return null;
  return (
    <div className="mk-toast-host" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`mk-toast mk-toast-${t.kind}`} onClick={() => dismiss(t.id)}>
          <span className="mk-toast-icon">{ICONS[t.kind]}</span>
          <span className="mk-toast-msg">{t.message}</span>
        </div>
      ))}
    </div>
  );
});
