/**
 * 文档状态层（决策输入 §8）：标签页、当前文件路径、脏状态。
 * 文本与撤销栈归 CodeMirror（编辑核心）所有；此处只存事实元数据。
 * 每个标签的编辑器状态（含撤销历史）存于非响应式 Map，避免高频渲染。
 */
import { create } from 'zustand';
import { fileNameOf, nextId } from '@renderer/shared/text-utils';
import { appBus } from '@renderer/shared/event-bus';

export interface TabInfo {
  id: string;
  path: string | null;
  name: string;
  dirty: boolean;
}

export interface DocumentState {
  tabs: TabInfo[];
  activeTabId: string | null;
  /** 新建空白标签，返回 tabId（F1.2） */
  newTab(initial?: { path: string | null; name?: string }): string;
  /** 打开文件：已打开则激活原标签（F1.1/F1.7） */
  openAsTab(path: string, name: string): { tabId: string; existed: boolean };
  activate(tabId: string): void;
  close(tabId: string): void;
  markDirty(tabId: string, dirty: boolean): void;
  /** 保存成功/另存为后更新路径与名称 */
  bindPath(tabId: string, path: string, name: string): void;
  activeTab(): TabInfo | null;
}

export const useDocumentStore = create<DocumentState>()((set, get) => ({
  tabs: [],
  activeTabId: null,

  newTab(initial) {
    const id = nextId('tab');
    const tab: TabInfo = {
      id,
      path: initial?.path ?? null,
      name: initial?.name ?? fileNameOf(initial?.path ?? null),
      dirty: false,
    };
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id }));
    appBus.emit('document:active-tab-changed', { tabId: id });
    return id;
  },

  openAsTab(path, name) {
    const existing = get().tabs.find((t) => t.path === path);
    if (existing) {
      get().activate(existing.id);
      return { tabId: existing.id, existed: true };
    }
    const id = get().newTab({ path, name });
    return { tabId: id, existed: false };
  },

  activate(tabId) {
    if (get().activeTabId === tabId) return;
    if (!get().tabs.some((t) => t.id === tabId)) return;
    set({ activeTabId: tabId });
    appBus.emit('document:active-tab-changed', { tabId });
  },

  close(tabId) {
    set((s) => {
      const index = s.tabs.findIndex((t) => t.id === tabId);
      if (index < 0) return s;
      const tabs = s.tabs.filter((t) => t.id !== tabId);
      let activeTabId = s.activeTabId;
      if (s.activeTabId === tabId) {
        activeTabId = tabs[Math.min(index, tabs.length - 1)]?.id ?? null;
      }
      return { tabs, activeTabId };
    });
    appBus.emit('document:active-tab-changed', { tabId: get().activeTabId });
  },

  markDirty(tabId, dirty) {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab || tab.dirty === dirty) return;
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, dirty } : t)) }));
    appBus.emit('document:dirty-state-changed', { tabId, dirty });
  },

  bindPath(tabId, path, name) {
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, path, name } : t)) }));
  },

  activeTab() {
    const { tabs, activeTabId } = get();
    return tabs.find((t) => t.id === activeTabId) ?? null;
  },
}));

/* ---------- 非响应式：每标签的编辑器完整状态（撤销栈/选区） ---------- */

const editorStates = new Map<string, unknown>();
/** 各标签最后一次快照文本（供切换标签与草稿使用；惰性写入） */
const tabTexts = new Map<string, string>();

export const tabStateStore = {
  saveEditorState(tabId: string, state: unknown, text: string): void {
    editorStates.set(tabId, state);
    tabTexts.set(tabId, text);
  },
  takeEditorState(tabId: string): unknown | undefined {
    return editorStates.get(tabId);
  },
  textOf(tabId: string): string | undefined {
    return tabTexts.get(tabId);
  },
  setText(tabId: string, text: string): void {
    tabTexts.set(tabId, text);
  },
  drop(tabId: string): void {
    editorStates.delete(tabId);
    tabTexts.delete(tabId);
  },
};
