import { describe, expect, it } from 'vitest';
import { proposalStageFailureReason } from '../../src/strategy-optimization/strategy-optimization-proposal-stage.js';

describe('实验候选阶段终态分类', () => {
  it('全部模型请求完成但格式无效时保留模型失败原因', () => {
    expect(
      proposalStageFailureReason(
        [],
        [
          { status: 'failed', errorCode: 'optimization_schema_invalid' },
          { status: 'failed', errorCode: 'optimization_invalid_json' },
        ],
      ),
    ).toBe('model_format_failure');
  });

  it('候选实际生成但验证无效时才声明没有有效候选', () => {
    expect(
      proposalStageFailureReason(
        [{ validationStatus: 'invalid' }],
        [{ status: 'failed', errorCode: 'optimization_schema_invalid' }],
      ),
    ).toBe('no_valid_candidate');
  });

  it('未知、混合或缺失的模型失败不猜成格式失败', () => {
    expect(proposalStageFailureReason([], [])).toBe('model_generation_failed');
    expect(
      proposalStageFailureReason(
        [],
        [
          { status: 'failed', errorCode: 'optimization_schema_invalid' },
          { status: 'failed', errorCode: 'optimization_transport_unknown' },
        ],
      ),
    ).toBe('model_generation_failed');
  });

  it('存在有效候选时继续等待封存测试', () => {
    expect(proposalStageFailureReason([{ validationStatus: 'valid' }], [])).toBeNull();
  });
});

it('全部能力报告保留独立结束原因，有有效候选时仍可完成正常评估', () => {
  const attempts = [
    {
      status: 'succeeded',
      errorCode: null,
      proposal: {
        status: 'unsupported',
        originalRule: '行业中性组合',
        reason: '缺行业历史与多资产账本',
        gaps: [{ path: 'executionInstrument', kind: 'execution', detail: '当前仅单标的' }],
        supportedParts: [],
        evidenceRefs: [],
      },
    },
  ];
  expect(proposalStageFailureReason([], attempts)).toBe('model_capability_gap');
  expect(proposalStageFailureReason([{ validationStatus: 'valid' }], attempts)).toBeNull();
});
