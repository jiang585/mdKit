/** 固定间隔防抖（U2：连续输入时预览刷新间隔固定，避免高频 DOM 操作） */

export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  cancel(): void;
  flush(): void;
  pending(): boolean;
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, waitMs: number): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: A | null = null;

  const invoke = (): void => {
    timer = null;
    if (lastArgs) {
      const args = lastArgs;
      lastArgs = null;
      fn(...args);
    }
  };

  const debounced = ((...args: A): void => {
    lastArgs = args;
    if (timer === null) {
      timer = setTimeout(invoke, waitMs);
    }
    // 计时期间新调用只更新参数，不重置计时 —— 保证固定刷新间隔（trailing 触发）
  }) as Debounced<A>;

  debounced.cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    lastArgs = null;
  };
  debounced.flush = () => {
    if (timer !== null) {
      clearTimeout(timer);
      invoke();
    }
  };
  debounced.pending = () => timer !== null;
  return debounced;
}
