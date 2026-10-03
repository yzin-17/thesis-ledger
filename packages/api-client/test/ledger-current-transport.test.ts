import { describe, expect, it, vi } from 'vitest';
import {
  ThesisLedgerApiClient,
  ThesisLedgerApiError,
  ThesisLedgerContractError,
} from '../src/index.js';

const accountId = '11111111-1111-4111-8111-111111111111';
const event = {
  version: 3,
  eventId: '22222222-2222-4222-8222-222222222222',
  factId: '33333333-3333-4333-8333-333333333333',
  accountId,
  ledgerRevision: '1',
  type: 'CASH_FLOW',
  occurredAt: '2026-10-01T02:00:00.000Z',
  timePrecision: 'INSTANT',
  sourceTimezone: 'Asia/Shanghai',
  economicOrderKey: 'a0',
  recordedAt: '2026-10-01T02:00:00.000Z',
  payloadVersion: 1,
  source: { category: 'MANUAL', channel: 'test' },
  actorId: 'test',
  revisionAction: 'CREATE',
  payload: { direction: 'INFLOW', category: 'DEPOSIT', amount: '100', currency: 'CNY' },
};
const envelope = (version: number) => ({
  accountId,
  ledgerRevision: '1',
  projectionGeneration: '1',
  events: [{ ...event, version }],
  effective: true,
  instrumentDirectory: { generation: 0, items: [], unresolvedSymbols: [] },
});

describe('Ledger 当前信封传输', () => {
  it.each(['events', 'audit'] as const)('%s 只读取当前信封，旧版本不重试或转换', async (kind) => {
    const invoke = (client: ThesisLedgerApiClient) =>
      kind === 'events'
        ? client.ledger.getEvents(accountId)
        : client.ledger.getEventAudit(accountId);
    const response = (version: number) =>
      kind === 'events'
        ? envelope(version)
        : { ...envelope(version), effective: false, asOfLedgerRevision: '1' };
    const current = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(response(3))));
    await expect(
      invoke(new ThesisLedgerApiClient('https://fixture.test/api/v1', current)),
    ).resolves.toMatchObject({ events: [{ version: 3, payloadVersion: 1 }] });
    const old = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(response(2))));
    await expect(
      invoke(new ThesisLedgerApiClient('https://fixture.test/api/v1', old)),
    ).rejects.toBeInstanceOf(ThesisLedgerContractError);
    expect(old).toHaveBeenCalledTimes(1);
  });

  it('服务端旧记录拒绝保持错误码和中文说明', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'UNSUPPORTED_CONTRACT_VERSION',
          code: 'UNSUPPORTED_CONTRACT_VERSION',
          message: '旧账本事件不支持读取或修订',
        }),
        { status: 409 },
      ),
    );
    await expect(
      new ThesisLedgerApiClient('https://fixture.test/api/v1', fetcher).ledger.getEvents(accountId),
    ).rejects.toMatchObject({
      constructor: ThesisLedgerApiError,
      status: 409,
      payload: { error: 'UNSUPPORTED_CONTRACT_VERSION', message: '旧账本事件不支持读取或修订' },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
