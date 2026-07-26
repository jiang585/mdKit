/**
 * Vitest 兼容垫片（沙盒/离线环境）：实现 describe/it/expect/vi 的最小子集，
 * 使纯逻辑单测无需安装依赖即可运行。语义对齐 Vitest（不足处按 node:assert 严格实现）。
 */
import assert from 'node:assert/strict';

interface TestCase {
  name: string;
  fn: () => Promise<void> | void;
}
interface Suite {
  name: string;
  tests: TestCase[];
  beforeEach: Array<() => Promise<void> | void>;
  afterEach: Array<() => Promise<void> | void>;
}

const suites: Suite[] = [];
let current: Suite | null = null;

export function describe(name: string, fn: () => void): void {
  const suite: Suite = { name, tests: [], beforeEach: [], afterEach: [] };
  suites.push(suite);
  const prev = current;
  current = suite;
  fn();
  current = prev;
}

export function it(name: string, fn: () => Promise<void> | void): void {
  if (!current) {
    describe('(顶层)', () => undefined);
    current = suites[suites.length - 1];
  }
  current.tests.push({ name, fn });
  if (current.name === '(顶层)') current = null;
}
export const test = it;

export function beforeEach(fn: () => Promise<void> | void): void {
  current?.beforeEach.push(fn);
}
export function afterEach(fn: () => Promise<void> | void): void {
  current?.afterEach.push(fn);
}

/* ---------------- expect ---------------- */

function makeMatchers(actual: unknown, negate: boolean): Record<string, unknown> {
  const check = (pass: boolean, message: string): void => {
    if (pass === negate) {
      throw new assert.AssertionError({ message: `${negate ? 'not.' : ''}${message}` });
    }
  };
  const matchers: Record<string, unknown> = {
    toBe: (expected: unknown) =>
      check(Object.is(actual, expected), `toBe 失败：${format(actual)} !== ${format(expected)}`),
    toEqual: (expected: unknown) => {
      let pass = true;
      try {
        assert.deepStrictEqual(actual, expected);
      } catch {
        pass = false;
      }
      check(pass, `toEqual 失败：${format(actual)} ≠ ${format(expected)}`);
    },
    toStrictEqual: (expected: unknown) => (matchers.toEqual as (e: unknown) => void)(expected),
    toBeNull: () => check(actual === null, `toBeNull 失败：${format(actual)}`),
    toBeUndefined: () => check(actual === undefined, `toBeUndefined 失败：${format(actual)}`),
    toBeDefined: () => check(actual !== undefined, 'toBeDefined 失败'),
    toBeTruthy: () => check(Boolean(actual), `toBeTruthy 失败：${format(actual)}`),
    toBeFalsy: () => check(!actual, `toBeFalsy 失败：${format(actual)}`),
    toContain: (expected: unknown) => {
      const pass = Array.isArray(actual)
        ? actual.includes(expected)
        : typeof actual === 'string' && actual.includes(String(expected));
      check(pass, `toContain 失败：${format(actual)} 不含 ${format(expected)}`);
    },
    toHaveLength: (n: number) =>
      check(
        (actual as { length?: number })?.length === n,
        `toHaveLength 失败：期望 ${n}，实际 ${(actual as { length?: number })?.length}`,
      ),
    toBeGreaterThan: (n: number) => check((actual as number) > n, `期望 > ${n}，实际 ${format(actual)}`),
    toBeGreaterThanOrEqual: (n: number) =>
      check((actual as number) >= n, `期望 ≥ ${n}，实际 ${format(actual)}`),
    toBeLessThan: (n: number) => check((actual as number) < n, `期望 < ${n}，实际 ${format(actual)}`),
    toBeLessThanOrEqual: (n: number) =>
      check((actual as number) <= n, `期望 ≤ ${n}，实际 ${format(actual)}`),
    toMatch: (re: RegExp | string) =>
      check(
        typeof actual === 'string' && (typeof re === 'string' ? actual.includes(re) : re.test(actual)),
        `toMatch 失败：${format(actual)} 不匹配 ${re}`,
      ),
    toThrow: (expected?: RegExp | string) => {
      let threw = false;
      let message = '';
      try {
        (actual as () => void)();
      } catch (err) {
        threw = true;
        message = err instanceof Error ? err.message : String(err);
      }
      let pass = threw;
      if (threw && expected) {
        pass = typeof expected === 'string' ? message.includes(expected) : expected.test(message);
      }
      check(pass, `toThrow 失败（threw=${threw}, msg=${message}）`);
    },
    toHaveBeenCalled: () =>
      check(((actual as MockFn)?.mock?.calls.length ?? 0) > 0, 'toHaveBeenCalled 失败'),
    toHaveBeenCalledTimes: (n: number) =>
      check(
        (actual as MockFn)?.mock?.calls.length === n,
        `toHaveBeenCalledTimes 失败：期望 ${n}，实际 ${(actual as MockFn)?.mock?.calls.length}`,
      ),
    toHaveBeenCalledWith: (...args: unknown[]) => {
      const calls = (actual as MockFn)?.mock?.calls ?? [];
      let pass = false;
      for (const call of calls) {
        try {
          assert.deepStrictEqual(call, args);
          pass = true;
          break;
        } catch {
          /* 继续 */
        }
      }
      check(pass, `toHaveBeenCalledWith 失败：${format(calls)} 不含 ${format(args)}`);
    },
  };
  if (!negate) {
    Object.defineProperty(matchers, 'not', { get: () => makeMatchers(actual, true) });
  }
  return matchers;
}

export function expect(actual: unknown): ReturnType<typeof makeMatchers> {
  return makeMatchers(actual, false);
}

function format(value: unknown): string {
  try {
    return JSON.stringify(value)?.slice(0, 120) ?? String(value);
  } catch {
    return String(value);
  }
}

/* ---------------- vi（fn + 假定时器） ---------------- */

export interface MockFn {
  (...args: unknown[]): unknown;
  mock: { calls: unknown[][] };
  mockReturnValue(v: unknown): MockFn;
  mockImplementation(fn: (...args: unknown[]) => unknown): MockFn;
}

interface FakeTimer {
  id: number;
  at: number;
  interval: number | null;
  fn: () => void;
}

const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
const realSetInterval = globalThis.setInterval;
const realClearInterval = globalThis.clearInterval;

let fakeNow = 0;
let fakeSeq = 1;
let fakeTimers: FakeTimer[] | null = null;

export const vi = {
  fn(impl?: (...args: unknown[]) => unknown): MockFn {
    let implementation = impl ?? ((): void => undefined);
    const mockFn = ((...args: unknown[]) => {
      mockFn.mock.calls.push(args);
      return implementation(...args);
    }) as MockFn;
    mockFn.mock = { calls: [] };
    mockFn.mockReturnValue = (v) => {
      implementation = () => v;
      return mockFn;
    };
    mockFn.mockImplementation = (fn) => {
      implementation = fn;
      return mockFn;
    };
    return mockFn;
  },

  useFakeTimers(): void {
    fakeTimers = [];
    fakeNow = 0;
    (globalThis as Record<string, unknown>).setTimeout = ((fn: () => void, ms = 0) => {
      const timer = { id: fakeSeq++, at: fakeNow + ms, interval: null, fn };
      fakeTimers?.push(timer);
      return timer.id;
    }) as typeof setTimeout;
    (globalThis as Record<string, unknown>).clearTimeout = ((id: number) => {
      if (fakeTimers) fakeTimers = fakeTimers.filter((t) => t.id !== id);
    }) as typeof clearTimeout;
    (globalThis as Record<string, unknown>).setInterval = ((fn: () => void, ms = 0) => {
      const timer = { id: fakeSeq++, at: fakeNow + ms, interval: ms, fn };
      fakeTimers?.push(timer);
      return timer.id;
    }) as typeof setInterval;
    (globalThis as Record<string, unknown>).clearInterval = ((id: number) => {
      if (fakeTimers) fakeTimers = fakeTimers.filter((t) => t.id !== id);
    }) as typeof clearInterval;
  },

  useRealTimers(): void {
    fakeTimers = null;
    globalThis.setTimeout = realSetTimeout;
    globalThis.clearTimeout = realClearTimeout;
    globalThis.setInterval = realSetInterval;
    globalThis.clearInterval = realClearInterval;
  },

  advanceTimersByTime(ms: number): void {
    if (!fakeTimers) return;
    const target = fakeNow + ms;
    for (;;) {
      const due = fakeTimers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      fakeNow = due.at;
      if (due.interval !== null) {
        due.at = fakeNow + due.interval;
      } else {
        fakeTimers = fakeTimers.filter((t) => t.id !== due.id);
      }
      due.fn();
    }
    fakeNow = target;
  },

  restoreAllMocks(): void {
    this.useRealTimers();
  },
};

/* ---------------- 运行器 ---------------- */

export async function __run(): Promise<{ passed: number; failed: number }> {
  let passed = 0;
  let failed = 0;
  for (const suite of suites) {
    let printedSuite = false;
    for (const testCase of suite.tests) {
      try {
        for (const hook of suite.beforeEach) await hook();
        await testCase.fn();
        for (const hook of suite.afterEach) await hook();
        passed += 1;
      } catch (err) {
        failed += 1;
        if (!printedSuite) {
          console.error(`\n✗ 套件：${suite.name}`);
          printedSuite = true;
        }
        const message = err instanceof Error ? err.message : String(err);
        console.error(`  ✗ ${testCase.name}\n    ${message}`);
      } finally {
        vi.useRealTimers();
      }
    }
  }
  return { passed, failed };
}
