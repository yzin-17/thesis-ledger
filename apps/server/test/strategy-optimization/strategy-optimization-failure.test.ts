import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  OptimizationBacktestFailure,
  optimizationFailureLabel,
} from '../../src/strategy-optimization/strategy-optimization-failure.js';
import { redactOptimizationError } from '../../src/strategy-optimization/strategy-optimization-common.js';

describe('优化失败分层', () => {
  it('预检缺口、协议失效与模型格式使用结构化错误分类', () => {
    expect(
      optimizationFailureLabel(
        new BadRequestException({ code: 'DATA_UNAVAILABLE', message: '缺行情' }),
      ),
    ).toBe('数据不可用');
    expect(optimizationFailureLabel({ code: 'PREPARATION_STALE' })).toBe('协议不兼容');
    expect(optimizationFailureLabel({ fact: { code: 'schema_invalid' } })).toBe('模型格式错误');
    expect(optimizationFailureLabel(new Error('DATA_UNAVAILABLE'))).toBeUndefined();
  });
  it('失败Run保留错误类别与既有脱敏，不冒充策略亏损', () => {
    const error = new OptimizationBacktestFailure(
      'DATA_UNAVAILABLE',
      '缺行情 Bearer fixture-secret',
    );
    expect(redactOptimizationError(error)).toBe('[数据不可用] 缺行情 Bearer [REDACTED]');
    expect(
      optimizationFailureLabel(new OptimizationBacktestFailure('INTERNAL_ERROR', 'worker故障')),
    ).toBe('运行故障');
  });
});
