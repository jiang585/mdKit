/**
 * AI 桥接层渲染侧状态：会话流、文档修改草稿（Diff）、行内辅助、请求预览确认。
 * 对编辑器零依赖：应用修改经组合根注入的回调完成（C1 接口隔离）。
 */
import { create } from 'zustand';
import type { AiMessage } from '@shared/ipc-contract';
import type { AiProfile } from '@shared/config-schema';
import { bridge } from '@renderer/shared/bridge';
import { nextId } from '@renderer/shared/text-utils';
import { appBus } from '@renderer/shared/event-bus';
import { computeLineDiff, type DiffChunk } from './diff';
import {
  buildChatMessages,
  buildDocEditMessages,
  buildInlineMessages,
  stripOuterFence,
  type DocContext,
} from './prompt-context';

export interface UiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  error?: string;
}

export interface DraftState {
  mode: 'doc' | 'inline';
  instruction: string;
  originalText: string;
  proposedText: string;
  chunks: DiffChunk[];
  accepted: Set<number>;
  /** inline 模式：替换的选区 */
  selFrom?: number;
  selTo?: number;
}

export interface PendingPreview {
  payload: AiMessage[];
  profileName: string;
  redactedHits: number;
  proceed: () => void;
  abort: () => void;
}

type StreamTarget =
  | { kind: 'chat'; messageId: string }
  | { kind: 'doc-edit' }
  | { kind: 'inline' };

interface AiState {
  profiles: AiProfile[];
  activeProfileId: string | null;
  chatMessages: UiChatMessage[];
  status: 'idle' | 'streaming';
  requestId: string | null;
  streamBuffer: string;
  streamTarget: StreamTarget | null;
  draft: DraftState | null;
  inlineOpen: boolean;
  inlineSelection: { from: number; to: number; text: string } | null;
  pendingPreview: PendingPreview | null;
  lastError: string | null;

  hydrateProfiles(profiles: AiProfile[], activeProfileId: string | null): void;
  setActiveProfile(id: string): void;
  sendChat(input: string, context: DocContext | null): Promise<void>;
  requestDocEdit(instruction: string, docText: string): Promise<void>;
  openInline(selection: { from: number; to: number; text: string }): void;
  closeInline(): void;
  requestInline(instruction: string): Promise<void>;
  cancel(): Promise<void>;
  toggleChunk(index: number): void;
  setAllChunks(accepted: boolean): void;
  discardDraft(): void;
  clearError(): void;
  clearChat(): void;
}

let wired = false;

function activeProfile(state: Pick<AiState, 'profiles' | 'activeProfileId'>): AiProfile | null {
  return state.profiles.find((p) => p.id === state.activeProfileId) ?? state.profiles[0] ?? null;
}

export const useAiStore = create<AiState>()((set, get) => {
  /** 统一发起请求（含 F7.9 请求预览确认闸口） */
  const startRequest = async (
    messages: AiMessage[],
    target: StreamTarget,
    redactedHits: number,
  ): Promise<void> => {
    const profile = activeProfile(get());
    if (!profile) {
      set({ lastError: '请先在设置中添加 AI 后端配置' });
      return;
    }
    const fire = async (): Promise<void> => {
      const requestId = nextId('ai');
      set({ status: 'streaming', requestId, streamBuffer: '', streamTarget: target, lastError: null });
      const res = await bridge().ai.chatStart({ requestId, profileId: profile.id, messages });
      if (!res.ok) {
        finishWithError(res.message ?? '请求发起失败');
      }
    };
    if (profile.previewRequests) {
      // 请求预览开关：展示将发送的内容，确认后才真正发出
      set({
        pendingPreview: {
          payload: messages,
          profileName: profile.name,
          redactedHits,
          proceed: () => {
            set({ pendingPreview: null });
            void fire();
          },
          abort: () => set({ pendingPreview: null, status: 'idle', streamTarget: null }),
        },
      });
      return;
    }
    await fire();
  };

  const finishWithError = (message: string): void => {
    const { streamTarget } = get();
    if (streamTarget?.kind === 'chat') {
      set((s) => ({
        chatMessages: s.chatMessages.map((m) =>
          m.id === streamTarget.messageId ? { ...m, streaming: false, error: message } : m,
        ),
      }));
    }
    set({ status: 'idle', requestId: null, streamTarget: null, lastError: message });
  };

  const finishSuccess = (): void => {
    const { streamTarget, streamBuffer, draft, inlineSelection } = get();
    if (!streamTarget) return;
    if (streamTarget.kind === 'chat') {
      set((s) => ({
        chatMessages: s.chatMessages.map((m) =>
          m.id === streamTarget.messageId ? { ...m, content: streamBuffer, streaming: false } : m,
        ),
      }));
    } else if (streamTarget.kind === 'doc-edit' && draft) {
      const proposed = stripOuterFence(streamBuffer);
      const chunks = computeLineDiff(draft.originalText, proposed);
      const changeIdx = chunks.filter((c) => c.kind === 'change').map((c) => c.index);
      set({
        draft: { ...draft, proposedText: proposed, chunks, accepted: new Set(changeIdx) },
      });
      appBus.emit('ai:draft-ready', { requestId: get().requestId ?? '' });
    } else if (streamTarget.kind === 'inline' && draft && inlineSelection) {
      const proposed = stripOuterFence(get().streamBuffer).replace(/\n$/, '');
      const chunks = computeLineDiff(draft.originalText, proposed);
      const changeIdx = chunks.filter((c) => c.kind === 'change').map((c) => c.index);
      set({ draft: { ...draft, proposedText: proposed, chunks, accepted: new Set(changeIdx) } });
    }
    set({ status: 'idle', requestId: null, streamTarget: null });
  };

  const wireStreaming = (): void => {
    if (wired) return;
    wired = true;
    const b = bridge();
    b.ai.onChunk((payload) => {
      const { requestId, delta } = payload as { requestId: string; delta: string };
      if (requestId !== get().requestId) return;
      set((s) => ({ streamBuffer: s.streamBuffer + delta }));
      const target = get().streamTarget;
      if (target?.kind === 'chat') {
        const buffer = get().streamBuffer;
        set((s) => ({
          chatMessages: s.chatMessages.map((m) =>
            m.id === target.messageId ? { ...m, content: buffer } : m,
          ),
        }));
      }
    });
    b.ai.onDone((payload) => {
      const { requestId } = payload as { requestId: string };
      if (requestId !== get().requestId) return;
      finishSuccess();
    });
    b.ai.onError((payload) => {
      const { requestId, message } = payload as { requestId: string; message: string };
      if (requestId !== get().requestId) return;
      finishWithError(message);
    });
  };

  return {
    profiles: [],
    activeProfileId: null,
    chatMessages: [],
    status: 'idle',
    requestId: null,
    streamBuffer: '',
    streamTarget: null,
    draft: null,
    inlineOpen: false,
    inlineSelection: null,
    pendingPreview: null,
    lastError: null,

    hydrateProfiles(profiles, activeProfileId) {
      wireStreaming();
      set({ profiles, activeProfileId: activeProfileId ?? profiles[0]?.id ?? null });
    },

    setActiveProfile(id) {
      set({ activeProfileId: id });
      void bridge().config.patch({ ai: { activeProfileId: id } });
    },

    async sendChat(input, context) {
      if (get().status === 'streaming' || !input.trim()) return;
      const profile = activeProfile(get());
      const history: AiMessage[] = get()
        .chatMessages.filter((m) => !m.error)
        .slice(-12)
        .map((m) => ({ role: m.role, content: m.content }));
      const { messages, redactedHits } = buildChatMessages(
        history,
        input,
        context,
        profile?.redact ?? false,
      );
      const userMsg: UiChatMessage = { id: nextId('msg'), role: 'user', content: input };
      const assistantMsg: UiChatMessage = {
        id: nextId('msg'),
        role: 'assistant',
        content: '',
        streaming: true,
      };
      set((s) => ({ chatMessages: [...s.chatMessages, userMsg, assistantMsg] }));
      await startRequest(messages, { kind: 'chat', messageId: assistantMsg.id }, redactedHits);
    },

    async requestDocEdit(instruction, docText) {
      if (get().status === 'streaming' || !instruction.trim()) return;
      const profile = activeProfile(get());
      const { messages, redactedHits } = buildDocEditMessages(
        instruction,
        docText,
        profile?.redact ?? false,
      );
      set({
        draft: {
          mode: 'doc',
          instruction,
          originalText: docText,
          proposedText: '',
          chunks: [],
          accepted: new Set(),
        },
      });
      await startRequest(messages, { kind: 'doc-edit' }, redactedHits);
    },

    openInline(selection) {
      set({ inlineOpen: true, inlineSelection: selection, draft: null, lastError: null });
    },

    closeInline() {
      set({ inlineOpen: false, inlineSelection: null, draft: null });
    },

    async requestInline(instruction) {
      const selection = get().inlineSelection;
      if (!selection || get().status === 'streaming' || !instruction.trim()) return;
      const profile = activeProfile(get());
      const { messages, redactedHits } = buildInlineMessages(
        instruction,
        selection.text,
        profile?.redact ?? false,
      );
      set({
        draft: {
          mode: 'inline',
          instruction,
          originalText: selection.text,
          proposedText: '',
          chunks: [],
          accepted: new Set(),
          selFrom: selection.from,
          selTo: selection.to,
        },
      });
      await startRequest(messages, { kind: 'inline' }, redactedHits);
    },

    async cancel() {
      const requestId = get().requestId;
      if (requestId) await bridge().ai.chatCancel(requestId);
      set({ status: 'idle', requestId: null, streamTarget: null });
    },

    toggleChunk(index) {
      set((s) => {
        if (!s.draft) return s;
        const accepted = new Set(s.draft.accepted);
        if (accepted.has(index)) accepted.delete(index);
        else accepted.add(index);
        return { draft: { ...s.draft, accepted } };
      });
    },

    setAllChunks(acceptedAll) {
      set((s) => {
        if (!s.draft) return s;
        const accepted = acceptedAll
          ? new Set(s.draft.chunks.filter((c) => c.kind === 'change').map((c) => c.index))
          : new Set<number>();
        return { draft: { ...s.draft, accepted } };
      });
    },

    discardDraft: () => set({ draft: null }),
    clearError: () => set({ lastError: null }),
    clearChat: () => set({ chatMessages: [] }),
  };
});
