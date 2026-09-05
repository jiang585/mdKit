import { describe, it, expect, vi } from 'vitest';
import { createEventBus } from '@renderer/shared/event-bus';

describe('事件总线（C3：一对多、发送方不关心接收方）', () => {
  it('emit 分发给全部订阅者', () => {
    const bus = createEventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('theme:switched', a);
    bus.on('theme:switched', b);
    bus.emit('theme:switched', { editorThemeId: 'x', previewThemeId: 'y' });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledWith({ editorThemeId: 'x', previewThemeId: 'y' });
  });

  it('无订阅者时 emit 不抛错', () => {
    const bus = createEventBus();
    expect(() => bus.emit('layout:mode-changed', { mode: 'split' })).not.toThrow();
  });

  it('on 返回的取消函数与 off 均可退订', () => {
    const bus = createEventBus();
    const a = vi.fn();
    const b = vi.fn();
    const offA = bus.on('editor:cursor-moved', a);
    bus.on('editor:cursor-moved', b);
    offA();
    bus.off('editor:cursor-moved', b);
    bus.emit('editor:cursor-moved', { line: 1, column: 1, offset: 0 });
    expect(a).toHaveBeenCalledTimes(0);
    expect(b).toHaveBeenCalledTimes(0);
  });

  it('单个订阅者异常不影响其他订阅者', () => {
    const bus = createEventBus();
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const good = vi.fn();
    bus.on('preview:render-completed', bad);
    bus.on('preview:render-completed', good);
    expect(() =>
      bus.emit('preview:render-completed', { revision: 1, durationMs: 5, diagnostics: 0 }),
    ).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
  });
});
