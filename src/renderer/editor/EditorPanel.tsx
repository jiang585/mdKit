/**
 * 编辑区 React 容器：负责实例生命周期与宿主 DOM，不复制文档内容进组件状态（决策输入 §9）。
 */
import { memo, useEffect, useRef } from 'react';
import { createEditor, type EditorCreateOptions, type EditorHandle } from './index';

export interface EditorPanelProps {
  options: Omit<EditorCreateOptions, 'parent'>;
  onReady: (handle: EditorHandle) => void;
  className?: string;
}

/** memo：App 重渲染不重建编辑器（性能策略 §9：React 不按按键频率重建编辑器组件） */
export const EditorPanel = memo(function EditorPanel({ options, onReady, className }: EditorPanelProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<EditorHandle | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!hostRef.current) return undefined;
    const handle = createEditor({ ...optionsRef.current, parent: hostRef.current });
    handleRef.current = handle;
    onReady(handle);
    return () => {
      handleRef.current = null;
      handle.destroy();
    };
    // onReady 由父组件保证引用稳定（useCallback）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={hostRef} className={`mk-editor-host ${className ?? ''}`} data-testid="editor-host" />;
});
