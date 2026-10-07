import { HttpException } from '@nestjs/common';

const categories = {
  DATA_UNAVAILABLE: '数据不可用',
  PREPARATION_STALE: '协议不兼容',
  RULE_REJECTED: '协议不兼容',
  schema_invalid: '模型格式错误',
  invalid_json: '模型格式错误',
  output_truncated: '模型输出截断',
  INTERNAL_ERROR: '运行故障',
} as const;

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};

/** 仅消费结构化错误码，不从可能包含事实内容的自由文本猜测失败类型。 */
export function optimizationFailureLabel(error: unknown): string | undefined {
  const value = record(error);
  const response = error instanceof HttpException ? record(error.getResponse()) : {};
  const code = response.code ?? record(value.fact).code ?? value.code;
  return typeof code === 'string' && Object.hasOwn(categories, code)
    ? categories[code as keyof typeof categories]
    : undefined;
}

export class OptimizationBacktestFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
