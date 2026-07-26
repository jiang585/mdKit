import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { StatusBar } from '@renderer/components/StatusBar';
import { useUiStore } from '@renderer/components/ui-store';
import { act } from '@testing-library/react';

describe('状态栏（U4）', () => {
  beforeEach(() => {
    cleanup();
    useUiStore.setState({ line: 1, column: 1, words: 0, themeName: '默认浅色', renderMs: null, diagnostics: 0, saving: false });
  });

  it('展示行列/字数/主题名称', () => {
    render(<StatusBar />);
    expect(screen.getByTestId('status-cursor').textContent).toContain('行:1');
    expect(screen.getByTestId('status-words').textContent).toContain('字数:0');
    expect(screen.getByTestId('status-theme').textContent).toContain('默认浅色');
  });

  it('独立订阅：光标与字数更新即时反映', async () => {
    render(<StatusBar />);
    await act(async () => {
      useUiStore.getState().setCursor(12, 5);
      useUiStore.getState().setWords(1024);
    });
    expect(screen.getByTestId('status-cursor').textContent).toContain('行:12 列:5');
    expect(screen.getByTestId('status-words').textContent).toContain('字数:1024');
  });

  it('渲染耗时超 300ms 时高亮警示', async () => {
    render(<StatusBar />);
    await act(async () => {
      useUiStore.getState().setRenderStats(450, 2);
    });
    expect(screen.getByText(/渲染 450ms/).className).toContain('mk-status-warn');
    expect(screen.getByText(/⚠ 2/)).toBeInTheDocument();
  });
});
