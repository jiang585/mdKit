import { describe, it, expect, vi } from 'vitest';
import { debounce } from '@renderer/shared/debounce';

describe('debounce（固定间隔防抖，U2）', () => {
  it('等待期内多次调用只触发一次，且使用最新参数', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const debounced = debounce(spy, 120);
    debounced(1);
    debounced(2);
    debounced(3);
    expect(spy).toHaveBeenCalledTimes(0);
    vi.advanceTimersByTime(119);
    expect(spy).toHaveBeenCalledTimes(0);
    vi.advanceTimersByTime(1);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(3);
    vi.useRealTimers();
  });

  it('间隔固定：计时期间的新调用不重置计时（刷新间隔可预测）', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const debounced = debounce(spy, 100);
    debounced('a');
    vi.advanceTimersByTime(90);
    debounced('b'); // 不应把触发点推迟到 190ms
    vi.advanceTimersByTime(10);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('b');
    vi.useRealTimers();
  });

  it('触发后再次调用开启新窗口', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const debounced = debounce(spy, 100);
    debounced(1);
    vi.advanceTimersByTime(100);
    debounced(2);
    vi.advanceTimersByTime(100);
    expect(spy).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('cancel 取消挂起调用；flush 立即执行', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const debounced = debounce(spy, 100);
    debounced(1);
    debounced.cancel();
    vi.advanceTimersByTime(200);
    expect(spy).toHaveBeenCalledTimes(0);

    debounced(2);
    expect(debounced.pending()).toBe(true);
    debounced.flush();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(2);
    expect(debounced.pending()).toBe(false);
    vi.useRealTimers();
  });
});
