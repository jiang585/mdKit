/** unified / remark / rehype 生态最小声明 */

declare module 'unified' {
  export interface VFileLike {
    toString(): string;
  }
  export interface Processor {
    use(plugin: unknown, options?: unknown): Processor;
    process(input: string): Promise<VFileLike>;
    processSync(input: string): VFileLike;
  }
  export function unified(): Processor;
}

declare module 'remark-parse' {
  const plugin: unknown;
  export default plugin;
}
declare module 'remark-gfm' {
  const plugin: unknown;
  export default plugin;
}
declare module 'remark-math' {
  const plugin: unknown;
  export default plugin;
}
declare module 'remark-rehype' {
  const plugin: unknown;
  export default plugin;
}
declare module 'rehype-katex' {
  const plugin: unknown;
  export default plugin;
}
declare module 'rehype-highlight' {
  const plugin: unknown;
  export default plugin;
}
declare module 'rehype-stringify' {
  const plugin: unknown;
  export default plugin;
}

declare module 'rehype-sanitize' {
  export interface SanitizeSchema {
    tagNames?: string[];
    attributes?: Record<string, unknown[]>;
    protocols?: Record<string, string[]>;
    clobberPrefix?: string;
    [key: string]: unknown;
  }
  export const defaultSchema: SanitizeSchema;
  const plugin: unknown;
  export default plugin;
}
