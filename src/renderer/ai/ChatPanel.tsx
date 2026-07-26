/**
 * AI 对话面板（F7.2）：上下文感知对话 + 文档修改（Diff 流）+ 请求预览确认（F7.9）。
 * 编辑器交互经组合根注入回调（getDocContext / onApplyEdits），模块间零直接依赖。
 */
import { memo, useCallback, useRef, useState } from 'react';
import { Modal } from '@renderer/components/Modal';
import { useAiStore } from './ai-store';
import { DiffView } from './DiffView';
import { buildEditsFromChunks } from './diff';
import type { DocContext } from './prompt-context';

export interface ChatPanelProps {
  getDocContext: () => DocContext | null;
  /** 单事务应用编辑（编辑核心注入，Ctrl+Z 一步撤销） */
  onApplyEdits: (edits: Array<{ from: number; to: number; insert: string }>) => void;
  onOpenSettings: () => void;
  onClose: () => void;
}

export const ChatPanel = memo(function ChatPanel({
  getDocContext,
  onApplyEdits,
  onOpenSettings,
  onClose,
}: ChatPanelProps) {
  const profiles = useAiStore((s) => s.profiles);
  const activeProfileId = useAiStore((s) => s.activeProfileId);
  const messages = useAiStore((s) => s.chatMessages);
  const status = useAiStore((s) => s.status);
  const draft = useAiStore((s) => s.draft);
  const pendingPreview = useAiStore((s) => s.pendingPreview);
  const lastError = useAiStore((s) => s.lastError);
  const store = useAiStore;

  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'chat' | 'doc-edit'>('chat');
  const [withContext, setWithContext] = useState(true);
  const listRef = useRef<HTMLDivElement | null>(null);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || status === 'streaming') return;
    setInput('');
    if (mode === 'chat') {
      await store.getState().sendChat(text, withContext ? getDocContext() : null);
    } else {
      const context = getDocContext();
      await store.getState().requestDocEdit(text, context?.docText ?? '');
    }
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    });
  }, [input, status, mode, withContext, getDocContext, store]);

  const applyDraft = useCallback(() => {
    const currentDraft = store.getState().draft;
    if (!currentDraft) return;
    if (currentDraft.mode === 'doc') {
      const edits = buildEditsFromChunks(
        currentDraft.originalText,
        currentDraft.chunks,
        currentDraft.accepted,
      );
      onApplyEdits(edits);
    }
    store.getState().discardDraft();
  }, [onApplyEdits, store]);

  const showDocDraft = draft?.mode === 'doc' && draft.chunks.length > 0;

  return (
    <aside className="mk-chat" data-testid="ai-panel">
      <header className="mk-chat-header">
        <span className="mk-chat-title">AI 助手</span>
        <select
          className="mk-select"
          aria-label="选择 AI 后端"
          value={activeProfileId ?? ''}
          onChange={(e) => store.getState().setActiveProfile(e.target.value)}
        >
          {profiles.length === 0 && <option value="">未配置后端</option>}
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}（{p.scene}）
            </option>
          ))}
        </select>
        <button type="button" className="mk-icon-btn" title="AI 设置" onClick={onOpenSettings}>
          ⚙
        </button>
        <button type="button" className="mk-icon-btn" aria-label="关闭面板" onClick={onClose}>
          ×
        </button>
      </header>

      {showDocDraft ? (
        <DiffView
          chunks={draft.chunks}
          accepted={draft.accepted}
          onToggle={(i) => store.getState().toggleChunk(i)}
          onSetAll={(v) => store.getState().setAllChunks(v)}
          onApply={applyDraft}
          onDiscard={() => store.getState().discardDraft()}
        />
      ) : (
        <div ref={listRef} className="mk-chat-list">
          {messages.length === 0 && (
            <div className="mk-chat-empty">
              <p>与 AI 讨论当前文档，或切换到「修改文档」模式让 AI 直接编辑。</p>
              <p className="mk-chat-empty-tip">所有修改都会以 Diff 展示，经你确认后才写入编辑器。</p>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`mk-chat-msg mk-chat-msg-${m.role}`}>
              <div className="mk-chat-msg-role">{m.role === 'user' ? '你' : 'AI'}</div>
              <div className="mk-chat-msg-body">
                {m.content || (m.streaming ? '…' : '')}
                {m.streaming && <span className="mk-chat-caret" />}
                {m.error && <div className="mk-chat-msg-error">⚠ {m.error}</div>}
              </div>
            </div>
          ))}
          {draft?.mode === 'doc' && status === 'streaming' && (
            <div className="mk-chat-msg mk-chat-msg-assistant">
              <div className="mk-chat-msg-role">AI</div>
              <div className="mk-chat-msg-body">正在生成修改稿… </div>
            </div>
          )}
        </div>
      )}

      {lastError && !showDocDraft && (
        <div className="mk-chat-error" role="alert">
          ⚠ {lastError}
          <button type="button" className="mk-link-btn" onClick={() => store.getState().clearError()}>
            知道了
          </button>
        </div>
      )}

      <footer className="mk-chat-composer">
        <div className="mk-chat-modes" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'chat'}
            className={`mk-chip ${mode === 'chat' ? 'mk-chip-on' : ''}`}
            onClick={() => setMode('chat')}
          >
            对话
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'doc-edit'}
            className={`mk-chip ${mode === 'doc-edit' ? 'mk-chip-on' : ''}`}
            onClick={() => setMode('doc-edit')}
            title="AI 输出修改稿，以 Diff 确认后写入"
          >
            修改文档
          </button>
          {mode === 'chat' && (
            <label className="mk-chat-ctx">
              <input
                type="checkbox"
                checked={withContext}
                onChange={(e) => setWithContext(e.target.checked)}
              />
              携带文档上下文
            </label>
          )}
        </div>
        <div className="mk-chat-inputrow">
          <textarea
            className="mk-chat-input"
            rows={2}
            placeholder={mode === 'chat' ? '输入问题… (Enter 发送，Shift+Enter 换行)' : '描述要对文档做的修改…'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
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
              disabled={!input.trim()}
              onClick={() => void send()}
            >
              发送
            </button>
          )}
        </div>
      </footer>

      {/* 请求预览（F7.9）：确认后才发送 */}
      <Modal
        open={pendingPreview !== null}
        title={`发送内容预览 → ${pendingPreview?.profileName ?? ''}`}
        onClose={() => pendingPreview?.abort()}
        wide
        footer={
          <>
            <button type="button" className="mk-btn" onClick={() => pendingPreview?.abort()}>
              取消发送
            </button>
            <button
              type="button"
              className="mk-btn mk-btn-primary"
              onClick={() => pendingPreview?.proceed()}
            >
              确认发送
            </button>
          </>
        }
      >
        {pendingPreview && (
          <div className="mk-preview-request">
            {pendingPreview.redactedHits > 0 && (
              <p className="mk-preview-request-redact">已脱敏 {pendingPreview.redactedHits} 处敏感内容</p>
            )}
            {pendingPreview.payload.map((m, i) => (
              <div key={i} className="mk-preview-request-msg">
                <div className="mk-preview-request-role">{m.role}</div>
                <pre className="mk-preview-request-content">{m.content}</pre>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </aside>
  );
});
