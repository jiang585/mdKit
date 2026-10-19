import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SplitPane } from '@renderer/layout/index';

describe('分屏容器（F5.1~F5.4）', () => {
  beforeEach(cleanup);

  const renderPane = (mode: 'split' | 'editor' | 'preview', onRatioChange = vi.fn()) =>
    render(
      <SplitPane
        mode={mode}
        ratio={0.5}
        onRatioChange={onRatioChange}
        left={<div data-testid="left">L</div>}
        right={<div data-testid="right">R</div>}
      />,
    );

  it('分屏模式两栏可见', () => {
    renderPane('split');
    expect(screen.getByTestId('left')).toBeInTheDocument();
    expect(screen.getByTestId('right')).toBeInTheDocument();
    expect(screen.getByTestId('split-divider')).toBeInTheDocument();
  });

  it('纯编辑模式隐藏预览（F5.2）', () => {
    renderPane('editor');
    expect(screen.getByTestId('left')).toBeInTheDocument();
    expect(screen.queryByTestId('right')).toBeNull();
  });

  it('纯预览模式隐藏编辑器但不卸载（F5.3，切回分屏内容不丢）', () => {
    renderPane('preview');
    expect(screen.getByTestId('left')).not.toBeVisible();
    expect(screen.getByTestId('right')).toBeInTheDocument();
  });

  it('预览 → 分屏切换复用同一编辑器节点', () => {
    const { rerender } = renderPane('split');
    const before = screen.getByTestId('left');
    const props = {
      ratio: 0.5,
      onRatioChange: vi.fn(),
      left: <div data-testid="left">L</div>,
      right: <div data-testid="right">R</div>,
    };
    rerender(<SplitPane mode="preview" {...props} />);
    rerender(<SplitPane mode="split" {...props} />);
    expect(screen.getByTestId('left')).toBe(before);
    expect(screen.getByTestId('left')).toBeVisible();
  });

  it('双击分隔条复位 50%', () => {
    const onRatioChange = vi.fn();
    renderPane('split', onRatioChange);
    fireEvent.doubleClick(screen.getByTestId('split-divider'));
    expect(onRatioChange).toHaveBeenCalledWith(0.5);
  });
});
