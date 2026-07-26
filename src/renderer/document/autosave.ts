/**
 * 自动保存（F1.8，可配置间隔）+ 崩溃恢复草稿写入（可用性 §3.3）。
 * 周期任务：
 *  - 活动脏标签且有路径 → 直接落盘保存；
 *  - 所有脏标签（含未保存新文档）→ 写入草稿目录。
 */
import { bridge } from '@renderer/shared/bridge';
import { useDocumentStore, tabStateStore } from './document-store';

export interface AutosaveController {
  configure(opts: { enabled: boolean; intervalMs: number }): void;
  /** 立即执行一轮（窗口失焦/关闭前） */
  flush(): Promise<void>;
  /** 保存成功后的清理（清除对应草稿） */
  clearDraft(tabId: string): void;
  dispose(): void;
}

export function createAutosave(getActiveText: () => string | null): AutosaveController {
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;

  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      const store = useDocumentStore.getState();
      const active = store.activeTab();
      // 活动标签文本从编辑器现取；其余标签用最近快照
      if (active) {
        const text = getActiveText();
        if (text !== null) tabStateStore.setText(active.id, text);
      }
      for (const tab of store.tabs) {
        if (!tab.dirty) continue;
        const text = tabStateStore.textOf(tab.id);
        if (text === undefined) continue;
        if (tab.id === active?.id && tab.path) {
          try {
            await bridge().file.save(tab.path, text);
            store.markDirty(tab.id, false);
            await bridge().drafts.clear(tab.id);
            continue;
          } catch {
            // 保存失败退回草稿通道，不打断循环（错误处理规范：不静默失败由 UI 层提示）
          }
        }
        await bridge().drafts.save(tab.id, tab.path, text).catch(() => undefined);
      }
    } finally {
      running = false;
    }
  };

  return {
    configure({ enabled, intervalMs }) {
      if (timer) clearInterval(timer);
      timer = enabled ? setInterval(() => void tick(), intervalMs) : null;
    },
    flush: () => tick(),
    clearDraft(tabId) {
      void bridge().drafts.clear(tabId);
    },
    dispose() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
