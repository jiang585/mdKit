/** 通用模态框：遮罩 + 面板 + Esc 关闭 */
import { memo, useEffect, type ReactNode } from 'react';

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

export const Modal = memo(function Modal({ open, title, onClose, children, footer, wide }: ModalProps) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="mk-modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`mk-modal ${wide ? 'mk-modal-wide' : ''}`} role="dialog" aria-label={title}>
        <header className="mk-modal-header">
          <h2>{title}</h2>
          <button type="button" className="mk-icon-btn" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="mk-modal-body">{children}</div>
        {footer && <footer className="mk-modal-footer">{footer}</footer>}
      </div>
    </div>
  );
});
