/** Zustand v4 最小声明 */
declare module 'zustand' {
  export type StateCreator<T> = (
    set: (partial: Partial<T> | ((state: T) => Partial<T>)) => void,
    get: () => T,
  ) => T;

  export interface UseBoundStore<T> {
    (): T;
    <U>(selector: (state: T) => U): U;
    getState(): T;
    setState(partial: Partial<T> | ((state: T) => Partial<T>)): void;
    subscribe(listener: (state: T, prev: T) => void): () => void;
  }

  export function create<T>(): (creator: StateCreator<T>) => UseBoundStore<T>;
  export function create<T>(creator: StateCreator<T>): UseBoundStore<T>;
}
