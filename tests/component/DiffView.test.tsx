import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DiffView } from '@renderer/ai/DiffView';
import { computeLineDiff } from '@renderer/ai/diff';

describe('Diff 预览（F7.6 / 验收7）', () => {
  beforeEach(cleanup);

  const chunks = computeLineDiff('A\nB\nC', 'A2\nB\nC2');
  const changeIdx = chunks.filter((c) => c.kind === 'change').map((c) => c.index);

  it('展示变更统计与增删行', () => {
    render(
      <DiffView
        chunks={chunks}
        accepted={new Set(changeIdx)}
        onToggle={vi.fn()}
        onSetAll={vi.fn()}
        onApply={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(screen.getByText(/2 处变更 · 已接受 2/)).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument(); // 删除行
    expect(screen.getByText('A2')).toBeInTheDocument(); // 新增行
  });

  it('勾选切换与批量接受/拒绝', () => {
    const onToggle = vi.fn();
    const onSetAll = vi.fn();
    render(
      <DiffView
        chunks={chunks}
        accepted={new Set([changeIdx[0]])}
        onToggle={onToggle}
        onSetAll={onSetAll}
        onApply={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    const checkbox = screen.getByTestId(`diff-chunk-${changeIdx[1]}`).querySelector('input');
    fireEvent.click(checkbox as Element);
    expect(onToggle).toHaveBeenCalledWith(changeIdx[1]);
    fireEvent.click(screen.getByText('全部拒绝'));
    expect(onSetAll).toHaveBeenCalledWith(false);
  });

  it('零接受时应用按钮禁用；有接受时可应用', () => {
    const onApply = vi.fn();
    const { unmount } = render(
      <DiffView chunks={chunks} accepted={new Set()} onToggle={vi.fn()} onSetAll={vi.fn()} onApply={onApply} onDiscard={vi.fn()} />,
    );
    expect((screen.getByTestId('diff-apply') as HTMLButtonElement).disabled).toBe(true);
    unmount();
    render(
      <DiffView chunks={chunks} accepted={new Set(changeIdx)} onToggle={vi.fn()} onSetAll={vi.fn()} onApply={onApply} onDiscard={vi.fn()} />,
    );
    fireEvent.click(screen.getByTestId('diff-apply'));
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('无差异时展示空态', () => {
    render(
      <DiffView
        chunks={computeLineDiff('same', 'same')}
        accepted={new Set()}
        onToggle={vi.fn()}
        onSetAll={vi.fn()}
        onApply={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(screen.getByText(/无需变更/)).toBeInTheDocument();
  });
});
