import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { authoringFailureCode } from '../../src/strategy-authoring/authoring-attempt.js';
import { AiSdkGenerationError } from '../../src/ai/ai-sdk-generation.adapter.js';

describe('编写单次尝试的稳定错误分类', () => {
  it('领域校验和模型结构校验明确分类，不输出异常文本', () => {
    const invalid = z.string().safeParse(42);
    expect(authoringFailureCode(invalid.error)).toBe('AUTHORING_SCHEMA_INVALID');
    expect(
      authoringFailureCode(new BadRequestException({ code: 'AUTHORING_SEMANTIC_MISMATCH' })),
    ).toBe('AUTHORING_SEMANTIC_MISMATCH');
    expect(authoringFailureCode(new Error('private provider body'))).toBe(
      'AUTHORING_EXECUTION_FAILED',
    );
  });
  it('SDK 和确定性服务端错误保留稳定码', () => {
    const sdk = new AiSdkGenerationError({
      code: 'schema_invalid',
      phase: 'validation',
      summary: 'invalid',
      externalResult: 'complete',
      requestId: 'request',
    });
    expect(authoringFailureCode(sdk)).toBe('AUTHORING_SCHEMA_INVALID');
    expect(authoringFailureCode(new Error('AUTHORING_MODEL_MISMATCH'))).toBe(
      'AUTHORING_MODEL_MISMATCH',
    );
    expect(authoringFailureCode(new BadRequestException('private message'))).toBe(
      'AUTHORING_EXECUTION_FAILED',
    );
  });
  it('执行期限的 AbortSignal 超时不被记录为作者主动取消', async () => {
    const signal = AbortSignal.timeout(1);
    await new Promise<void>((resolve) =>
      signal.addEventListener('abort', () => resolve(), { once: true }),
    );
    const sdk = new AiSdkGenerationError({
      code: 'cancelled',
      phase: 'cancellation',
      summary: 'aborted',
      externalResult: 'unknown',
      requestId: 'request',
    });
    expect(authoringFailureCode(sdk, signal.reason)).toBe('AUTHORING_TIMEOUT');
    expect(authoringFailureCode(sdk, new Error('author cancelled'))).toBe('AUTHORING_CANCELLED');
    expect(authoringFailureCode(sdk, new Error('AUTHORING_LEASE_LOST'))).toBe(
      'AUTHORING_RESULT_UNKNOWN',
    );
    expect(authoringFailureCode(sdk, new Error('AUTHORING_EXECUTOR_STOPPED'))).toBe(
      'AUTHORING_RESULT_UNKNOWN',
    );
  });
});
