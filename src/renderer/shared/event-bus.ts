/**
 * 类型化事件总线（决策输入 §2：mitt 或等价薄封装 —— 此为零依赖等价实现）。
 * 仅传递「事实通知」，载荷禁止 DOM / CodeMirror 实例 / Electron 对象 / AST（§8）。
 * 事件命名：<模块>:<动作>[-<结果>]（开发规范 §4.2）。
 */

export interface BusEvents {
  'editor:content-changed': { source: 'user-input' | 'ai-apply' | 'file-load'; revision: number };
  'editor:cursor-moved': { line: number; column: number; offset: number };
  'document:dirty-state-changed': { tabId: string; dirty: boolean };
  'document:active-tab-changed': { tabId: string | null };
  'preview:render-completed': { revision: number; durationMs: number; diagnostics: number };
  'preview:scroll-anchor-changed': { anchorLine: number; anchorType: 'heading' | 'block' };
  'theme:switched': { editorThemeId: string; previewThemeId: string };
  'layout:mode-changed': { mode: 'split' | 'editor' | 'preview' };
  'ai:draft-ready': { requestId: string };
}

type Handler<T> = (payload: T) => void;

export interface EventBus {
  on<K extends keyof BusEvents>(type: K, handler: Handler<BusEvents[K]>): () => void;
  off<K extends keyof BusEvents>(type: K, handler: Handler<BusEvents[K]>): void;
  emit<K extends keyof BusEvents>(type: K, payload: BusEvents[K]): void;
}

export function createEventBus(): EventBus {
  const handlers = new Map<keyof BusEvents, Set<Handler<never>>>();
  return {
    on(type, handler) {
      let set = handlers.get(type);
      if (!set) {
        set = new Set();
        handlers.set(type, set);
      }
      set.add(handler as Handler<never>);
      return () => this.off(type, handler);
    },
    off(type, handler) {
      handlers.get(type)?.delete(handler as Handler<never>);
    },
    emit(type, payload) {
      // 发送方不关心接收方数量与存在性（C3）；单个订阅者异常不影响其他订阅者
      handlers.get(type)?.forEach((handler) => {
        try {
          (handler as Handler<BusEvents[typeof type]>)(payload);
        } catch (err) {
          console.error(`[event-bus] handler error on ${String(type)}`, err);
        }
      });
    },
  };
}

/** 应用级单例总线 */
export const appBus: EventBus = createEventBus();
