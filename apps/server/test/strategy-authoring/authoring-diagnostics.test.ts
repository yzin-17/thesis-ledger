import { describe, expect, it } from 'vitest';
import { authoringValidationIssues } from '../../src/strategy-authoring/authoring-diagnostics.js';

describe('编写校验诊断', () => {
  it('穿透 SDK cause，只保留代码与路径，不输出错误消息或模型原文', () => {
    const error = new Error('private body', {
      cause: {
        cause: {
          issues: [
            {
              code: 'invalid_type',
              path: ['strategy', 'risk', 0, 'percent'],
              message: 'private body',
              input: 'secret',
            },
          ],
        },
      },
    });
    expect(authoringValidationIssues(error)).toEqual([
      { code: 'invalid_type', path: 'strategy.risk.0.percent' },
    ]);
  });
  it('限制循环、数量、路径长度和不可信字段', () => {
    const error = {
      cause: null as unknown,
      issues: Array.from({ length: 30 }, () => ({
        code: 'invalid_type',
        path: ['strategy', 'secret\nvalue'],
      })),
    };
    error.cause = error;
    expect(authoringValidationIssues(error)).toHaveLength(12);
    expect(authoringValidationIssues(error)[0]!.path).toBe('strategy.?');
    expect(authoringValidationIssues(new Error('no object generated'))).toEqual([]);
  });
});
