/**
 * 布局状态（Zustand 分片 —— 决策输入 §8：主题/布局/偏好归全局状态）。
 * 仅存布局事实；持久化由组合根（App）经 bridge 完成。
 */
import { create } from 'zustand';
import type { LayoutMode } from '@shared/config-schema';
import { SPLIT_RATIO_MAX, SPLIT_RATIO_MIN } from '@shared/constants';
import { appBus } from '@renderer/shared/event-bus';

export interface LayoutState {
  mode: LayoutMode;
  ratio: number;
  tocVisible: boolean;
  aiPanelVisible: boolean;
  setMode(mode: LayoutMode): void;
  setRatio(ratio: number): void;
  toggleToc(): void;
  toggleAiPanel(): void;
  hydrate(state: Partial<Pick<LayoutState, 'mode' | 'ratio' | 'tocVisible' | 'aiPanelVisible'>>): void;
}

export const useLayoutStore = create<LayoutState>()((set) => ({
  mode: 'split',
  ratio: 0.5,
  tocVisible: false,
  aiPanelVisible: false,
  setMode: (mode) => {
    set({ mode });
    appBus.emit('layout:mode-changed', { mode });
  },
  setRatio: (ratio) =>
    set({ ratio: Math.min(SPLIT_RATIO_MAX, Math.max(SPLIT_RATIO_MIN, ratio)) }),
  toggleToc: () => set((s) => ({ tocVisible: !s.tocVisible })),
  toggleAiPanel: () => set((s) => ({ aiPanelVisible: !s.aiPanelVisible })),
  hydrate: (state) => set(state),
}));
