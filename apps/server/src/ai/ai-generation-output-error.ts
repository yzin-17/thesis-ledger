import { sanitize } from './ai-sdk-generation-facts.js';

/** 已完整返回但未通过本地解析的候选，不包含额外的 Provider 事实。 */
export class AiGenerationOutputValidationError extends Error {
  constructor(readonly text: string, cause: unknown) {
    super('结构化响应未通过解析或契约校验', { cause });
    this.name = 'AiGenerationOutputValidationError';
  }
}

export function isGenerationOutputFailure(error: unknown) {
  const name = error && typeof error === 'object' && 'name' in error ? error.name : null;
  return error instanceof AiGenerationOutputValidationError || error instanceof SyntaxError || name === 'ZodError' ||
    (typeof name === 'string' && name.includes('NoOutputGeneratedError')) || sanitize(error).startsWith('No object generated');
}
