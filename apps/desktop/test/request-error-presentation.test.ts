import { describe, expect, it } from 'vitest';
import { ThesisLedgerApiError, ThesisLedgerContractError } from '@thesis-ledger/api-client';
import { apiErrorResponseSchema } from '@thesis-ledger/schemas';
import { presentRequestFailure, requestFailureMessage } from '../src/shared/api/request-error.js';

describe('请求失败的用户展示', () => {
  it('服务失败不变成输入归因，协议详情仍可按需查看', () => {
    const payload = apiErrorResponseSchema.parse({
      error: 'service_unavailable',
      errorCode: 'SERVICE_UNAVAILABLE',
      message: '内部服务失败',
      details: { field: 'quantity' },
    });
    const result = presentRequestFailure(new ThesisLedgerApiError(503, payload));
    expect(result.message).toContain('稍后重试');
    expect(result.message).not.toContain('API');
    expect(result.technical).toEqual({
      status: 503,
      code: payload.errorCode,
      fields: null,
      details: payload.details,
    });
  });
  it('业务字段错误和版本冲突保留服务端的明确说明', () => {
    const message = '数量必须为正数';
    expect(
      requestFailureMessage(
        new ThesisLedgerApiError(
          400,
          apiErrorResponseSchema.parse({
            error: 'validation',
            errorCode: 'INPUT_INVALID',
            message,
          }),
        ),
      ),
    ).toBe(message);
    expect(requestFailureMessage(new ThesisLedgerApiError(409, null))).toContain('版本');
  });
  it('使用当前信封的字段明细，保留路径和业务码', () => {
    const payload = apiErrorResponseSchema.parse({
      error: 'validation',
      errorCode: 'INPUT_INVALID',
      fields: [{ path: 'quantity', message: '数量必须为正数' }],
    });
    const result = presentRequestFailure(new ThesisLedgerApiError(400, payload));
    expect(result.message).toBe('数量必须为正数');
    expect(result.technical?.fields).toEqual(payload.fields);
    expect(result.technical?.code).toBe('INPUT_INVALID');
  });
  it('网络、限流、未知错误有中文回退', () => {
    expect(requestFailureMessage(new TypeError('Failed to fetch'))).toContain('网络');
    expect(requestFailureMessage(new ThesisLedgerApiError(429, null))).toContain('稍候');
    expect(requestFailureMessage(new Error('503'))).toContain('稍后重试');
    expect(requestFailureMessage({})).toContain('稍后重试');
  });
  it('响应契约失败不暗示重新提交，原领域说明继续可读', () => {
    expect(requestFailureMessage(new ThesisLedgerContractError('/saved'))).toContain(
      '避免重复提交',
    );
    expect(requestFailureMessage(new Error('配置已保存，列表读取失败'))).toBe(
      '配置已保存，列表读取失败',
    );
  });
});
