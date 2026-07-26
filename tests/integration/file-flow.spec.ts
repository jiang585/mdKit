/**
 * 集成：文档状态层 × 桥接 Mock —— 打开/编辑脏标记/保存/关闭 与 自动保存草稿链路。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { bridge } from '@renderer/shared/bridge';
import { tabStateStore, useDocumentStore } from '@renderer/document/document-store';
import { createAutosave } from '@renderer/document/autosave';

function resetStore(): void {
  useDocumentStore.setState({ tabs: [], activeTabId: null });
}

describe('文档状态层', () => {
  beforeEach(resetStore);

  it('打开文件建标签；重复打开同路径复用原标签（F1.1）', () => {
    const store = useDocumentStore.getState();
    const first = store.openAsTab('/mock/a.md', 'a.md');
    const second = useDocumentStore.getState().openAsTab('/mock/a.md', 'a.md');
    expect(second.existed).toBe(true);
    expect(second.tabId).toBe(first.tabId);
    expect(useDocumentStore.getState().tabs).toHaveLength(1);
  });

  it('脏标记流转与保存绑定路径', () => {
    const store = useDocumentStore.getState();
    const id = store.newTab();
    store.markDirty(id, true);
    expect(useDocumentStore.getState().tabs[0].dirty).toBe(true);
    store.bindPath(id, '/mock/x.md', 'x.md');
    store.markDirty(id, false);
    const tab = useDocumentStore.getState().tabs[0];
    expect(tab.path).toBe('/mock/x.md');
    expect(tab.dirty).toBe(false);
  });

  it('关闭活动标签后激活相邻标签', () => {
    const store = useDocumentStore.getState();
    const a = store.newTab({ path: null, name: 'A' });
    const b = store.newTab({ path: null, name: 'B' });
    store.newTab({ path: null, name: 'C' });
    store.activate(b);
    store.close(b);
    const state = useDocumentStore.getState();
    expect(state.tabs.map((t) => t.name)).toEqual(['A', 'C']);
    expect(state.activeTabId).toBe(state.tabs[1].id);
    store.close(state.tabs[1].id);
    expect(useDocumentStore.getState().activeTabId).toBe(a);
  });
});

describe('自动保存（F1.8）+ 草稿（可用性 §3.3）', () => {
  beforeEach(resetStore);

  it('有路径的脏标签落盘并清脏；未保存标签写草稿', async () => {
    const store = useDocumentStore.getState();
    const saved = store.newTab({ path: '/mock/s.md', name: 's.md' });
    store.markDirty(saved, true);
    tabStateStore.setText(saved, '# 已保存文档内容');

    const autosave = createAutosave(() => '# 已保存文档内容');
    await autosave.flush();

    expect(useDocumentStore.getState().tabs.find((t) => t.id === saved)?.dirty).toBe(false);
    const read = await bridge().file.read('/mock/s.md');
    expect(read.content).toBe('# 已保存文档内容');
    autosave.dispose();
  });

  it('定时器按配置间隔触发', async () => {
    vi.useFakeTimers();
    const store = useDocumentStore.getState();
    const id = store.newTab({ path: '/mock/t.md', name: 't.md' });
    store.markDirty(id, true);
    tabStateStore.setText(id, 'v1');

    const autosave = createAutosave(() => 'v1');
    autosave.configure({ enabled: true, intervalMs: 5000 });
    vi.advanceTimersByTime(5000);
    vi.useRealTimers();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect((await bridge().file.read('/mock/t.md')).content).toBe('v1');
    autosave.dispose();
  });
});
