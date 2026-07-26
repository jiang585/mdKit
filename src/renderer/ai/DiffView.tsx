/**
 * Diff 预览（F7.6 / 验收标准 7）：逐块接受/拒绝，统计与批量操作。
 */
import { memo } from 'react';
import type { DiffChunk } from './diff';

export interface DiffViewProps {
  chunks: DiffChunk[];
  accepted: ReadonlySet<number>;
  onToggle: (index: number) => void;
  onSetAll: (accepted: boolean) => void;
  onApply: () => void;
  onDiscard: () => void;
  applying?: boolean;
}

export const DiffView = memo(function DiffView({
  chunks,
  accepted,
  onToggle,
  onSetAll,
  onApply,
  onDiscard,
  applying,
}: DiffViewProps) {
  const changes = chunks.filter((c) => c.kind === 'change');
  const acceptedCount = changes.filter((c) => accepted.has(c.index)).length;

  if (changes.length === 0) {
    return (
      <div className="mk-diff-empty">
        AI 返回结果与当前文档一致，无需变更。
        <button type="button" className="mk-btn" onClick={onDiscard}>
          关闭
        </button>
      </div>
    );
  }

  return (
    <div className="mk-diff" data-testid="diff-view">
      <header className="mk-diff-header">
        <span className="mk-diff-stat">
          {changes.length} 处变更 · 已接受 {acceptedCount}
        </span>
        <span className="mk-diff-actions">
          <button type="button" className="mk-link-btn" onClick={() => onSetAll(true)}>
            全部接受
          </button>
          <button type="button" className="mk-link-btn" onClick={() => onSetAll(false)}>
            全部拒绝
          </button>
        </span>
      </header>

      <div className="mk-diff-list">
        {chunks.map((chunk) =>
          chunk.kind === 'equal' ? (
            <ContextRow key={chunk.index} chunk={chunk} />
          ) : (
            <div
              key={chunk.index}
              className={`mk-diff-chunk ${accepted.has(chunk.index) ? 'mk-diff-chunk-on' : ''}`}
              data-testid={`diff-chunk-${chunk.index}`}
            >
              <label className="mk-diff-chunk-head">
                <input
                  type="checkbox"
                  checked={accepted.has(chunk.index)}
                  onChange={() => onToggle(chunk.index)}
                />
                <span>
                  第 {chunk.oldStart + 1} 行起
                  {chunk.oldLines.length > 0 && ` · 删 ${chunk.oldLines.length} 行`}
                  {chunk.newLines.length > 0 && ` · 增 ${chunk.newLines.length} 行`}
                </span>
              </label>
              {chunk.oldLines.length > 0 && (
                <pre className="mk-diff-old">
                  {chunk.oldLines.map((line, i) => (
                    <div key={i} className="mk-diff-line">
                      <span className="mk-diff-sign">−</span>
                      {line || ' '}
                    </div>
                  ))}
                </pre>
              )}
              {chunk.newLines.length > 0 && (
                <pre className="mk-diff-new">
                  {chunk.newLines.map((line, i) => (
                    <div key={i} className="mk-diff-line">
                      <span className="mk-diff-sign">＋</span>
                      {line || ' '}
                    </div>
                  ))}
                </pre>
              )}
            </div>
          ),
        )}
      </div>

      <footer className="mk-diff-footer">
        <button type="button" className="mk-btn" onClick={onDiscard}>
          放弃
        </button>
        <button
          type="button"
          className="mk-btn mk-btn-primary"
          disabled={acceptedCount === 0 || applying}
          onClick={onApply}
          data-testid="diff-apply"
        >
          应用 {acceptedCount} 处变更（可 Ctrl+Z 撤销）
        </button>
      </footer>
    </div>
  );
});

function ContextRow({ chunk }: { chunk: DiffChunk }) {
  const lines = chunk.oldLines;
  if (lines.length <= 2) {
    return (
      <pre className="mk-diff-context">
        {lines.map((line, i) => (
          <div key={i} className="mk-diff-line">
            <span className="mk-diff-sign"> </span>
            {line || ' '}
          </div>
        ))}
      </pre>
    );
  }
  return (
    <pre className="mk-diff-context">
      <div className="mk-diff-line">
        <span className="mk-diff-sign"> </span>
        {lines[0] || ' '}
      </div>
      <div className="mk-diff-fold">⋯ {lines.length - 2} 行未变更 ⋯</div>
      <div className="mk-diff-line">
        <span className="mk-diff-sign"> </span>
        {lines[lines.length - 1] || ' '}
      </div>
    </pre>
  );
}
