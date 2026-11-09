import { describe, expect, it } from 'vitest';
import { riskScanFeedback } from '../src/features/risk/risk-scan-feedback.js';
import { presentRequestFailure } from '../src/shared/api/request-error.js';
import { ThesisLedgerApiError } from '@thesis-ledger/api-client';
import type { RiskScanResult } from '../src/features/risk/risk.types.js';

const response: RiskScanResult = { traceId: 'trace', scanId: 'scan', results: [] };
const completed = { type: 'success' as const, description: '本次扫描未产生新的风险事件。' };
const failure = {
  ruleId: 'weight-rule',
  errorCode: 'input-unavailable',
  error: '风险规则不可评估：组合持仓权重不完整，请补齐持仓估值后重试',
};

describe('风险扫描反馈', () => {
  it('没有可执行规则时明确提示创建或启用', () => {
    expect(riskScanFeedback({ ...response, evaluatedRuleCount: 0 }, completed)).toEqual({
      title: '未执行风险扫描',
      type: 'info',
      description: '当前没有可执行的风险规则，请先创建或启用规则。',
    });
  });
  it('全部规则输入不可用时显示原因，不宣称没有风险', () => {
    expect(
      riskScanFeedback({ ...response, evaluatedRuleCount: 1, results: [failure] }, completed),
    ).toMatchObject({
      title: '风险扫描未完成',
      type: 'error',
      description: expect.stringContaining(failure.error),
    });
  });
  it('部分失败与事件成功同时呈现，按规则去重', () => {
    const feedback = riskScanFeedback(
      {
        ...response,
        evaluatedRuleCount: 2,
        results: [failure, { ...failure }, { ruleId: 'price-rule', eventId: 'event' }],
      },
      completed,
    );
    expect(feedback).toMatchObject({ title: '风险扫描部分完成', type: 'warning' });
    expect(feedback.description).toContain('1 条规则处理未完成');
    expect(feedback.description).toContain('已记录 1 个风险事件');
  });
  it('其他规则未触发也不把部分失败当成全部失败', () => {
    expect(
      riskScanFeedback({ ...response, evaluatedRuleCount: 2, results: [failure] }, completed).title,
    ).toBe('风险扫描部分完成');
  });
  it('通知排队失败明确保留事件已记录的事实', () => {
    const feedback = riskScanFeedback(
      {
        ...response,
        results: [
          {
            ruleId: 'price-rule',
            eventId: 'event',
            errorCode: 'notification-enqueue-failed',
            error: '风险已记录，通知排队失败',
          },
        ],
      },
      completed,
    );
    expect(feedback.title).toBe('风险扫描部分完成');
    expect(feedback.description).toContain('已记录 1 个风险事件');
    expect(feedback.description).toContain('通知排队失败');
  });
  it('兼容旧响应，保留正常成功文案', () => {
    expect(riskScanFeedback(response, completed)).toEqual({
      title: '风险扫描已完成',
      ...completed,
    });
  });
  it('服务端中文字段原因可通过现有错误投影显示', () => {
    const error = new ThesisLedgerApiError(400, {
      error: 'validation_error',
      message: '输入不符合要求',
      fields: [{ path: 'security.0.weight', message: '持仓权重必须是有效的有限数字' }],
    });
    expect(presentRequestFailure(error).message).toBe('持仓权重必须是有效的有限数字');
  });
});
