/** vitest / Testing Library 最小声明（沙盒对测试文件做类型检查用） */

declare module 'vitest' {
  export interface Matchers {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toStrictEqual(expected: unknown): void;
    toBeNull(): void;
    toBeTruthy(): void;
    toBeFalsy(): void;
    toBeUndefined(): void;
    toBeDefined(): void;
    toContain(expected: unknown): void;
    toHaveLength(expected: number): void;
    toBeGreaterThan(expected: number): void;
    toBeGreaterThanOrEqual(expected: number): void;
    toBeLessThan(expected: number): void;
    toBeLessThanOrEqual(expected: number): void;
    toMatch(expected: RegExp | string): void;
    toThrow(expected?: RegExp | string): void;
    toHaveBeenCalled(): void;
    toHaveBeenCalledTimes(n: number): void;
    toHaveBeenCalledWith(...args: unknown[]): void;
    toBeInTheDocument(): void;
    toHaveClass(name: string): void;
    not: Matchers;
  }
  export function expect(actual: unknown): Matchers;
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: () => Promise<void> | void): void;
  export const test: typeof it;
  export function beforeEach(fn: () => Promise<void> | void): void;
  export function afterEach(fn: () => Promise<void> | void): void;

  export interface MockFn {
    (...args: unknown[]): unknown;
    mock: { calls: unknown[][] };
    mockReturnValue(v: unknown): MockFn;
    mockResolvedValue(v: unknown): MockFn;
    mockImplementation(fn: (...args: unknown[]) => unknown): MockFn;
  }
  export const vi: {
    fn(impl?: (...args: unknown[]) => unknown): MockFn;
    useFakeTimers(): void;
    useRealTimers(): void;
    advanceTimersByTime(ms: number): void;
    restoreAllMocks(): void;
  };
}

declare module '@testing-library/react' {
  import type { ReactElement } from 'react';
  export interface Queries {
    getByText(text: string | RegExp): HTMLElement;
    getByTestId(id: string): HTMLElement;
    queryByTestId(id: string): HTMLElement | null;
    getByRole(role: string, options?: { name?: string | RegExp }): HTMLElement;
    getByLabelText(text: string | RegExp): HTMLElement;
    queryByText(text: string | RegExp): HTMLElement | null;
    getAllByRole(role: string): HTMLElement[];
  }
  export function render(element: ReactElement): Queries & { container: HTMLElement; unmount(): void };
  export const screen: Queries;
  export const fireEvent: {
    click(el: Element): void;
    change(el: Element, init?: { target?: { value?: string } }): void;
    keyDown(el: Element, init?: { key?: string; shiftKey?: boolean }): void;
    pointerDown(el: Element, init?: Record<string, unknown>): void;
    pointerMove(el: Element, init?: Record<string, unknown>): void;
    pointerUp(el: Element, init?: Record<string, unknown>): void;
    doubleClick(el: Element): void;
    scroll(el: Element): void;
  };
  export function cleanup(): void;
  export function act(fn: () => Promise<void> | void): Promise<void>;
}

declare module '@testing-library/user-event' {
  const userEvent: {
    setup(): {
      click(el: Element): Promise<void>;
      type(el: Element, text: string): Promise<void>;
      keyboard(text: string): Promise<void>;
    };
  };
  export default userEvent;
}

declare module '@testing-library/jest-dom' {
  const nothing: void;
  export default nothing;
}
declare module '@testing-library/jest-dom/vitest' {
  const nothing: void;
  export default nothing;
}
