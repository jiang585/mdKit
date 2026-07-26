/** Zod 最小类型系统（保真 infer 推导；沙盒类型检查用） */
declare module 'zod' {
  type DeepPartial<T> = T extends Array<unknown>
    ? T
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T;

  export interface ZodIssue {
    message: string;
    path: Array<string | number>;
  }
  export class ZodError {
    issues: ZodIssue[];
  }

  export interface ZodType<Out> {
    _output: Out;
    parse(data: unknown): Out;
    safeParse(data: unknown): { success: true; data: Out } | { success: false; error: ZodError };
    optional(): ZodType<Out | undefined>;
    nullable(): ZodType<Out | null>;
    default(value: Out | (() => Out)): ZodType<Out>;
  }

  export interface ZodString extends ZodType<string> {
    min(n: number, msg?: string): ZodString;
    max(n: number, msg?: string): ZodString;
    regex(re: RegExp, msg?: string): ZodString;
    url(msg?: string): ZodString;
    email(msg?: string): ZodString;
  }

  export interface ZodNumber extends ZodType<number> {
    min(n: number, msg?: string): ZodNumber;
    max(n: number, msg?: string): ZodNumber;
    int(msg?: string): ZodNumber;
    positive(msg?: string): ZodNumber;
  }

  export interface ZodBoolean extends ZodType<boolean> {
    _boolean: true;
  }

  export interface ZodArray<T> extends ZodType<T[]> {
    min(n: number, msg?: string): ZodArray<T>;
    max(n: number, msg?: string): ZodArray<T>;
  }

  type Shape = Record<string, ZodType<unknown>>;
  type InferShape<S extends Shape> = { [K in keyof S]: S[K]['_output'] };

  export interface ZodObject<S extends Shape> extends ZodType<InferShape<S>> {
    shape: S;
    deepPartial(): ZodType<DeepPartial<InferShape<S>>>;
    partial(): ZodType<Partial<InferShape<S>>>;
    default(value: Partial<InferShape<S>>): ZodType<InferShape<S>>;
  }

  export interface ZodEnum<T extends string> extends ZodType<T> {
    _enum: true;
  }

  export type ZodTypeAny = ZodType<unknown>;

  export const z: {
    object<S extends Shape>(shape: S): ZodObject<S>;
    string(): ZodString;
    number(): ZodNumber;
    boolean(): ZodBoolean;
    literal<T extends string | number | boolean>(value: T): ZodType<T>;
    enum<U extends string, T extends readonly [U, ...U[]]>(values: T): ZodEnum<T[number]>;
    /* 以「模式类型整体」推断再取 _output，避免方法逆变参数污染元素类型推导 */
    array<S extends ZodType<unknown>>(item: S): ZodArray<S['_output']>;
    record<S extends ZodType<unknown>>(key: ZodType<string>, value: S): ZodType<Record<string, S['_output']>>;
    union<T extends ZodType<unknown>[]>(types: T): ZodType<T[number]['_output']>;
  };

  export namespace z {
    export type infer<T extends ZodType<unknown>> = T['_output'];
    export type ZodTypeAny = ZodType<unknown>;
  }
}
