/**
 * 行内辅助（F7.5）：选中文本 + 快捷键唤起 → 指令 → 结果 Diff → 替换/插入。
 * 写入经单事务回调（可撤销），与编辑核心解耦。
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from '@renderer/components/Modal';
import { useAiStore } from './ai-store';

export interface InlineAssistProps {
  /** 单事务替换选区（from/to 来自唤起时的选区快照） */
  onReplace: (from: number, to: number, text: string) => void;
}

export const InlineAssist = memo(function InlineAssist({ onReplace }: InlineAssistProps) {
  const open = useAiStore((s) => s.inlineOpen);
  const selection = useAiStore((s) => s.inlineSelection);
  const status = useAiStore((s) => s.status);
  const draft = useAiStore((s) => s.draft);
  const lastError = useAiStore((s) => s.lastError);
  const store = useAiStore;

  const [instruction, setInstruction] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setInstruction('');
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const close = useCallback(() => store.getState().closeInline(), [store]);

  const result = draft?.mode === 'inline' && status === 'idle' ? draft.proposedText : null;

  const apply = useCallback(() => {
    const currentDraft = store.getState().draft;
    const sel = store.getState().inlineSelection;
    if (!currentDraft || currentDraft.mode !== 'inline' || !sel) return;
    onReplace(sel.from, sel.to, currentDraft.proposedText);
    close();
  }, [store, onReplace, close]);

  return (
    <Modal open={open} title="AI 行内辅助" onClose={close}>
      <div className="mk-inline-assist">
        {selection && selection.text ? (
          <div className="mk-inline-selection">
            <div className="mk-inline-label">选中文本（{selection.text.length} 字符）</div>
            <pre className="mk-inline-text">{truncate(selection.text, 600)}</pre>
          </div>
        ) : (
          <p className="mk-inline-label">未选中文本：结果将插入光标处。</p>
        )}

        <div className="mk-inline-inputrow">
          <input
            ref={inputRef}
            className="mk-input"
            placeholder="如：润色 / 翻译成英文 / 改写为要点列表…"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && instruction.trim() && status !== 'streaming') {
                void store.getState().requestInline(instruction);
              }
            }}
          />
          {status === 'streaming' ? (
            <button type="button" className="mk-btn" onClick={() => void store.getState().cancel()}>
              停止
            </button>
          ) : (
            <button
              type="button"
              className="mk-btn mk-btn-primary"
              disabled={!instruction.trim()}
              onClick={() => void store.getState().requestInline(instruction)}
            >
              生成
            </button>
          )}
        </div>

        {status === 'streaming' && <div className="mk-inline-streaming">生成中…</div>}
        {lastError && <div className="mk-chat-msg-error">⚠ {lastError}</div>}

        {result !== null && (
          <div className="mk-inline-result">
            <div className="mk-inline-label">生成结果</div>
            <pre className="mk-inline-text mk-inline-text-new">{truncate(result, 1200)}</pre>
            <div className="mk-inline-actions">
              <button type="button" className="mk-btn" onClick={close}>
                取消
              </button>
              <button type="button" className="mk-btn mk-btn-primary" onClick={apply}>
                {selection?.text ? '替换选中内容' : '插入光标处'}（可撤销）
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
});

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n…（已截断展示）` : text;
}
