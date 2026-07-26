/**
 * 分屏容器（F5.1/F5.4）：左右两栏 + 可拖拽分隔条；双击分隔条复位 50%。
 * 纯编辑/纯预览模式由 mode 控制单栏铺满（F5.2/F5.3）。
 */
import { useCallback, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import type { LayoutMode } from '@shared/config-schema';

export interface SplitPaneProps {
  mode: LayoutMode;
  ratio: number;
  onRatioChange: (ratio: number) => void;
  left: ReactNode;
  right: ReactNode;
}

export function SplitPane({ mode, ratio, onRatioChange, left, right }: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      draggingRef.current = true;
      (event.target as HTMLElement).setPointerCapture(event.pointerId);
      document.body.classList.add('mk-resizing');
    },
    [],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;
      onRatioChange((event.clientX - rect.left) / rect.width);
    },
    [onRatioChange],
  );

  const stopDragging = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    (event.target as HTMLElement).releasePointerCapture(event.pointerId);
    document.body.classList.remove('mk-resizing');
  }, []);

  const showLeft = mode !== 'preview';
  const showRight = mode !== 'editor';
  const leftBasis = mode === 'split' ? `${(ratio * 100).toFixed(2)}%` : '100%';

  return (
    <div ref={containerRef} className={`mk-split mk-split-${mode}`} data-testid="split-pane">
      {showLeft && (
        <div className="mk-split-left" style={mode === 'split' ? { flexBasis: leftBasis } : undefined}>
          {left}
        </div>
      )}
      {mode === 'split' && (
        <div
          className="mk-split-divider"
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={Math.round(ratio * 100)}
          data-testid="split-divider"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
          onDoubleClick={() => onRatioChange(0.5)}
        >
          <div className="mk-split-divider-grip" />
        </div>
      )}
      {showRight && <div className="mk-split-right">{right}</div>}
    </div>
  );
}
