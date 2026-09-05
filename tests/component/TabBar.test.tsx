import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TabBar } from '@renderer/components/TabBar';

const tabs = [
  { id: 't1', path: 'C:\\a.md', name: 'a.md', dirty: false },
  { id: 't2', path: null, name: '未命名', dirty: true },
];

describe('多标签页（F1.6）', () => {
  beforeEach(cleanup);

  it('渲染标签、激活态与脏标记', () => {
    render(
      <TabBar tabs={tabs} activeTabId="t1" onActivate={vi.fn()} onClose={vi.fn()} onNew={vi.fn()} />,
    );
    expect(screen.getByTestId('tab-t1').className).toContain('mk-tab-active');
    expect(screen.getByTestId('tab-t2').querySelector('.mk-tab-dot-dirty')).toBeTruthy();
  });

  it('点击标签切换、点击 × 关闭（不触发切换）', () => {
    const onActivate = vi.fn();
    const onClose = vi.fn();
    render(<TabBar tabs={tabs} activeTabId="t1" onActivate={onActivate} onClose={onClose} onNew={vi.fn()} />);
    fireEvent.click(screen.getByTestId('tab-t2'));
    expect(onActivate).toHaveBeenCalledWith('t2');
    fireEvent.click(screen.getByRole('button', { name: '关闭 a.md' }));
    expect(onClose).toHaveBeenCalledWith('t1');
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('新建按钮', () => {
    const onNew = vi.fn();
    render(<TabBar tabs={tabs} activeTabId="t1" onActivate={vi.fn()} onClose={vi.fn()} onNew={onNew} />);
    fireEvent.click(screen.getByRole('button', { name: '新建文档' }));
    expect(onNew).toHaveBeenCalledTimes(1);
  });
});
