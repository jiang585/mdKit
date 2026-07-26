/** React 18 最小声明（覆盖本项目使用面；沙盒类型检查用） */
declare module 'react' {
  export type Key = string | number;
  export type ReactNode =
    | ReactElement
    | string
    | number
    | boolean
    | null
    | undefined
    | Iterable<ReactNode>;
  export interface ReactElement {
    type: unknown;
    props: unknown;
    key: Key | null;
  }
  export interface ErrorInfo {
    componentStack?: string | null;
  }

  export interface RefObject<T> {
    current: T;
  }
  export interface MutableRefObject<T> {
    current: T;
  }

  type SetStateAction<S> = S | ((prev: S) => S);
  type Dispatch<A> = (action: A) => void;

  export function useState<S>(initial: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
  export function useState<S = undefined>(): [S | undefined, Dispatch<SetStateAction<S | undefined>>];
  export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T;
  export function useCallback<T extends (...args: never[]) => unknown>(fn: T, deps: readonly unknown[]): T;
  export function useRef<T>(initial: T): MutableRefObject<T>;
  export function useRef<T>(initial: T | null): RefObject<T | null>;

  export function memo<P>(component: (props: P) => ReactElement | null): (props: P) => ReactElement | null;

  export class Component<P = Record<string, never>, S = Record<string, never>> {
    constructor(props: P);
    props: P;
    state: S;
    setState(state: Partial<S>): void;
    render(): ReactNode;
  }

  export const StrictMode: (props: { children?: ReactNode }) => ReactElement | null;

  /* ---- 合成事件（结构性子集） ---- */
  export interface SyntheticEvent<T = Element, E = Event> {
    target: EventTarget;
    currentTarget: T;
    preventDefault(): void;
    stopPropagation(): void;
    nativeEvent: E;
  }
  export interface MouseEvent<T = Element> extends SyntheticEvent<T, globalThis.MouseEvent> {
    clientX: number;
    clientY: number;
    button: number;
  }
  export interface PointerEvent<T = Element> extends MouseEvent<T> {
    pointerId: number;
  }
  export interface KeyboardEvent<T = Element> extends SyntheticEvent<T, globalThis.KeyboardEvent> {
    key: string;
    shiftKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
  }
  export interface ChangeEvent<T = Element> extends SyntheticEvent<T> {
    target: EventTarget & T;
  }

  const React: {
    createElement: (...args: unknown[]) => ReactElement;
  };
  export default React;
}

declare module 'react/jsx-runtime' {
  import type {
    ReactElement,
    ReactNode,
    Key,
    MouseEvent,
    PointerEvent,
    KeyboardEvent,
    ChangeEvent,
    SyntheticEvent,
  } from 'react';
  export function jsx(type: unknown, props: unknown, key?: Key): ReactElement;
  export function jsxs(type: unknown, props: unknown, key?: Key): ReactElement;
  export const Fragment: unknown;

  /** 事件处理器以方法签名声明（双变），显式标注更精细元素类型的处理器亦可赋值 */
  interface MkDomProps<T> {
    children?: ReactNode;
    key?: Key | null;
    onClick?(e: MouseEvent<T>): void;
    onAuxClick?(e: MouseEvent<T>): void;
    onDoubleClick?(e: MouseEvent<T>): void;
    onMouseDown?(e: MouseEvent<T>): void;
    onChange?(e: ChangeEvent<T>): void;
    onBlur?(e: ChangeEvent<T>): void;
    onKeyDown?(e: KeyboardEvent<T>): void;
    onScroll?(e: SyntheticEvent<T>): void;
    onPointerDown?(e: PointerEvent<T>): void;
    onPointerMove?(e: PointerEvent<T>): void;
    onPointerUp?(e: PointerEvent<T>): void;
    onPointerCancel?(e: PointerEvent<T>): void;
    [attr: string]: unknown;
  }

  export namespace JSX {
    type Element = ReactElement;
    interface ElementChildrenAttribute {
      children: unknown;
    }
    interface IntrinsicAttributes {
      key?: Key | null;
    }
    interface IntrinsicElements {
      input: MkDomProps<HTMLInputElement>;
      textarea: MkDomProps<HTMLTextAreaElement>;
      select: MkDomProps<HTMLSelectElement>;
      [element: string]: MkDomProps<HTMLElement>;
    }
  }
}

declare module 'react-dom/client' {
  import type { ReactNode } from 'react';
  export function createRoot(container: Element): { render(node: ReactNode): void; unmount(): void };
}
