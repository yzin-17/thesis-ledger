import { describe, expect, it, vi } from 'vitest';
import {
  ThesisLedgerApiClient,
  ThesisLedgerContractError,
  ThesisLedgerApiError,
} from '../src/index.js';
import { id, other, risk, preview } from './strategy-management.fixture.js';
function setup(value: unknown, status = 200) {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => new Response(JSON.stringify(value), { status }));
  return {
    api: new ThesisLedgerApiClient('https://fixture.test/api/v1', fetcher).strategy.risk,
    fetcher,
  };
}
describe('策略风险应用共享合同', () => {
  it('预览与创建保留账户、版本、指纹、标识及显式关闭的通知', async () => {
    const input = {
      strategyVersionId: id,
      accountId: other,
      symbol: '600000',
      cycleMode: 'existingAndFuture' as const,
    };
    await setup(preview).api.preview(input);
    const { api, fetcher } = setup(risk);
    const body = {
      ...input,
      previewHash: preview.previewHash,
      idempotencyKey: 'original-key',
      enabled: false,
      notification: risk.notification as never,
    };
    await api.create(body);
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual(body);
  });
  it('列表返回其他账户、详情返回其他应用、计划 hash 不匹配均拒绝', async () => {
    await expect(setup([risk]).api.list({ accountId: id })).rejects.toBeInstanceOf(
      ThesisLedgerContractError,
    );
    await expect(setup({ ...risk, id: other }).api.read(id)).rejects.toBeInstanceOf(
      ThesisLedgerContractError,
    );
    await expect(setup({ ...risk, planHash: 'stale' }).api.read(id)).rejects.toBeInstanceOf(
      ThesisLedgerContractError,
    );
  });
  it('非法修订和缺少指纹在请求前拒绝', () => {
    const { api, fetcher } = setup(risk);
    expect(() => api.update(id, { expectedRevision: 0, enabled: true })).toThrow();
    expect(() =>
      api.upgrade(id, {
        expectedRevision: 2,
        targetStrategyVersionId: other,
        previewHash: '',
        idempotencyKey: 'key',
      }),
    ).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('归档只带修订，服务端冲突保留错误，不重试、不永久删除', async () => {
    const { api, fetcher } = setup({ message: '修订冲突', errorCode: 'REVISION_CONFLICT' }, 409);
    await expect(api.archive(id, 2)).rejects.toBeInstanceOf(ThesisLedgerApiError);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe('DELETE');
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({ expectedRevision: 2 });
  });
  it('升级预览不写应用，正式升级使用原修订与幂等键并核对目标版本', async () => {
    const { api, fetcher } = setup({ ...preview, currentRevision: 2, diff: [] });
    await api.previewUpgrade(id, other);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('/upgrade-preview');
    await expect(
      setup(risk).api.upgrade(id, {
        expectedRevision: 2,
        targetStrategyVersionId: other,
        previewHash: 'hash',
        idempotencyKey: 'key',
      }),
    ).rejects.toBeInstanceOf(ThesisLedgerContractError);
  });
});
