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

  it('纯预览模式隐藏编辑器（F5.3）', () => {
    renderPane('preview');
    expect(screen.queryByTestId('left')).toBeNull();
    expect(screen.getByTestId('right')).toBeInTheDocument();
  });

  it('双击分隔条复位 50%', () => {
    const onRatioChange = vi.fn();
    renderPane('split', onRatioChange);
    fireEvent.doubleClick(screen.getByTestId('split-divider'));
    expect(onRatioChange).toHaveBeenCalledWith(0.5);
  });
});
