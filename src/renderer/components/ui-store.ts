/**
 * 轻量 UI 状态：状态栏数据独立订阅（决策输入 §9：状态栏使用独立订阅更新，
 * 光标/字数高频变化不牵动 App 重渲染）+ 全局 Toast。
 */
import { create } from 'zustand';

export interface StatusInfo {
  line: number;
  column: number;
  words: number;
  themeName: string;
  renderMs: number | null;
  diagnostics: number;
  saving: boolean;
}

interface UiState extends StatusInfo {
  setCursor(line: number, column: number): void;
  setWords(words: number): void;
  setThemeName(name: string): void;
  setRenderStats(ms: number, diagnostics: number): void;
  setSaving(saving: boolean): void;
}

export const useUiStore = create<UiState>()((set) => ({
  line: 1,
  column: 1,
  words: 0,
  themeName: '',
  renderMs: null,
  diagnostics: 0,
  saving: false,
  setCursor: (line, column) => set({ line, column }),
  setWords: (words) => set({ words }),
  setThemeName: (themeName) => set({ themeName }),
  setRenderStats: (renderMs, diagnostics) => set({ renderMs, diagnostics }),
  setSaving: (saving) => set({ saving }),
}));

/* ---------- Toast ---------- */

export interface ToastItem {
  id: number;
  kind: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

interface ToastState {
  toasts: ToastItem[];
  push(kind: ToastItem['kind'], message: string): void;
  dismiss(id: number): void;
}

let toastSeq = 0;

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  push: (kind, message) => {
    toastSeq += 1;
    const id = toastSeq;
    set((s) => ({ toasts: [...s.toasts.slice(-4), { id, kind, message }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, kind === 'error' ? 6000 : 3500);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** 任意位置可调用的全局提示（错误处理规范：用户可见错误提示，不静默失败） */
export function toast(kind: ToastItem['kind'], message: string): void {
  useToastStore.getState().push(kind, message);
}
