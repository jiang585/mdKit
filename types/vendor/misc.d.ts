/** Ajv / mermaid / 资源导入 最小声明 */

declare module 'ajv' {
  export interface ErrorObject {
    instancePath: string;
    message?: string;
  }
  export interface ValidateFunction {
    (data: unknown): boolean;
    errors?: ErrorObject[] | null;
  }
  export default class Ajv {
    constructor(options?: { allErrors?: boolean; strict?: boolean });
    compile(schema: object): ValidateFunction;
  }
}

declare module 'mermaid' {
  const mermaid: {
    initialize(config: Record<string, unknown>): void;
    render(id: string, code: string): Promise<{ svg: string }>;
  };
  export default mermaid;
}

declare module '*.css' {
  const nothing: void;
  export default nothing;
}

declare module '*.css?raw' {
  const content: string;
  export default content;
}
