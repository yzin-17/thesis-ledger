import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { backtestClients } from '../src/backtest-clients.js';

const model = JSON.parse(
  readFileSync(
    new URL('../../schemas/fixtures/backtest-execution-model.cn-2024q1.json', import.meta.url),
    'utf8',
  ),
);
const input = {
  strategyVersionId: '11111111-1111-4111-8111-111111111111',
  startDate: '2024-01-02',
  endDate: '2024-03-29',
  currency: 'CNY' as const,
  adjustment: 'none' as const,
};
describe('策略回测执行设置传输', () => {
  it('只发送用户运行意图，读取已验证的完整执行设置', async () => {
    const request = vi.fn(async () => ({ status: 'available', model }));
    expect(await backtestClients(request as never).resolveExecutionModel(input)).toMatchObject({
      status: 'available',
      model,
    });
    expect(request).toHaveBeenCalledWith(
      '/backtests/run-config/execution-model',
      expect.anything(),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ ...input, policy: 'research-defaults' }),
      }),
    );
  });
  it('不接受与当前日期不兼容的设置', async () => {
    const request = vi.fn(async () => ({ status: 'available', model }));
    await expect(
      backtestClients(request as never).resolveExecutionModel({ ...input, endDate: '2025-01-01' }),
    ).rejects.toThrow('与当前日期、币种或价格口径不一致');
  });
});
