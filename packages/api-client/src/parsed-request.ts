/** 跨平台传输只依赖 safeParse 合同，不依赖具体领域或运行时。 */
export type ParsedResponseSchema<T> = {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
};
export type ParsedRequest = <T>(
  path: string,
  schema: ParsedResponseSchema<T>,
  init?: RequestInit,
) => Promise<T>;
export type ParsedPost = <T>(
  path: string,
  body: unknown,
  schema: ParsedResponseSchema<T>,
  signal?: AbortSignal,
) => Promise<T>;
