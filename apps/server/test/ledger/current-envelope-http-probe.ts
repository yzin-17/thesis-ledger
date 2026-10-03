import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  apiErrorResponseSchema,
  ledgerAuditResponseSchema,
  ledgerCommandResponseSchema,
  ledgerEventsResponseSchema,
  ledgerReplayResponseSchema,
} from '@thesis-ledger/schemas';

export const ledgerHttp =
  (origin: string, token?: string) => async (path: string, body?: unknown) => {
    const response = await fetch(new URL(`/api/v1/ledger${path}`, origin), {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30000),
    });
    return { status: response.status, payload: (await response.json()) as unknown };
  };

type Request = ReturnType<typeof ledgerHttp>;
const accepted = (reply: Awaited<ReturnType<Request>>, status: number) => {
  assert.equal(reply.status, status, `HTTP 状态不符：${JSON.stringify(reply.payload)}`);
  return reply.payload;
};
const occurredAt = '2026-09-29T02:00:00.000Z';
const source = (externalId: string) => ({ category: 'MANUAL', channel: 'e03-d', externalId });
export const probeExecution = (accountId: string, symbol: string, key: string) => ({
  command: 'CREATE_EXECUTION',
  accountId,
  occurredAt,
  timePrecision: 'INSTANT',
  sourceTimezone: 'Asia/Shanghai',
  economicOrderKey: key,
  actorId: 'e03-d',
  source: source(key),
  side: 'BUY',
  payload: {
    symbol,
    quantity: '10',
    price: '10',
    currency: 'CNY',
    capabilityVerification: 'VERIFIED',
    settledAt: '2026-09-30T02:00:00.000Z',
    charges: [{ category: 'COMMISSION', amount: '2', currency: 'CNY' }],
  },
});

// 仅向调用方显式提供的空验收账户写入，保留全部审计事实。
export async function runCurrentLedgerHttpProbe(
  request: Request,
  accountId: string,
  symbol: string,
) {
  const empty = ledgerEventsResponseSchema.parse(
    accepted(await request(`/${accountId}/events`), 200),
  );
  assert.equal(empty.ledgerRevision, '0', '验收账户必须没有账本历史');
  assert.equal(empty.events.length, 0);
  const key = `e03-d-${randomUUID()}`;
  const command = probeExecution(accountId, symbol, `${key}-buy`);
  const deposit = ledgerCommandResponseSchema.parse(
    accepted(
      await request('/cash-flows', {
        ...command,
        command: 'CREATE_CASH_FLOW',
        source: source(`${key}-deposit`),
        economicOrderKey: `${key}-a0`,
        side: undefined,
        payload: { direction: 'INFLOW', category: 'DEPOSIT', amount: '1000', currency: 'CNY' },
      }),
      201,
    ),
  );
  const created = ledgerCommandResponseSchema.parse(
    accepted(await request('/executions', command), 201),
  );
  const repeated = ledgerCommandResponseSchema.parse(
    accepted(await request('/executions', command), 201),
  );
  assert.equal(repeated.idempotentReplay, true);
  assert.deepEqual(repeated.eventIds, created.eventIds);
  const correction = {
    ...command,
    command: 'REPLACE_EXECUTION',
    expectedLedgerRevision: '2',
    supersedesEventId: created.eventIds[0],
    reason: 'E03 目标数量修订验收',
    source: source(`${key}-replace`),
    payload: { ...command.payload, quantity: '20' },
  };
  const replaced = ledgerCommandResponseSchema.parse(
    accepted(await request('/executions/replace', correction), 201),
  );
  const beforeConflict = ledgerAuditResponseSchema.parse(
    accepted(await request(`/${accountId}/events/audit`), 200),
  );
  const conflict = apiErrorResponseSchema.parse(
    accepted(
      await request('/executions/replace', {
        ...correction,
        expectedLedgerRevision: '0',
        supersedesEventId: replaced.eventIds[0],
        source: source(`${key}-stale`),
      }),
      409,
    ),
  );
  assert.equal(conflict.error, 'LEDGER_REVISION_CONFLICT');
  assert.deepEqual(
    ledgerAuditResponseSchema.parse(accepted(await request(`/${accountId}/events/audit`), 200)),
    beforeConflict,
  );
  const voided = ledgerCommandResponseSchema.parse(
    accepted(
      await request('/executions/void', {
        command: 'VOID_EXECUTION',
        accountId,
        expectedLedgerRevision: '3',
        supersedesEventId: replaced.eventIds[0],
        reason: 'E03 目标撤销验收',
        actorId: 'e03-d',
        source: source(`${key}-void`),
      }),
      201,
    ),
  );
  const afterVoid = ledgerEventsResponseSchema.parse(
    accepted(await request(`/${accountId}/events`), 200),
  );
  assert.deepEqual(
    afterVoid.events.map((event) => event.type),
    ['CASH_FLOW'],
  );
  const restored = ledgerCommandResponseSchema.parse(
    accepted(
      await request('/executions/restore', {
        ...command,
        command: 'RESTORE_EXECUTION',
        expectedLedgerRevision: '4',
        supersedesEventId: voided.eventIds[0],
        reason: 'E03 目标恢复验收',
        source: source(`${key}-restore`),
      }),
      201,
    ),
  );
  assert.deepEqual(restored.factIds, created.factIds);
  const current = ledgerEventsResponseSchema.parse(
    accepted(await request(`/${accountId}/events`), 200),
  );
  const audit = ledgerAuditResponseSchema.parse(
    accepted(await request(`/${accountId}/events/audit`), 200),
  );
  const replay = ledgerReplayResponseSchema.parse(
    accepted(await request(`/${accountId}/events/replay?asOfRevision=2`), 200),
  );
  assert.equal(current.ledgerRevision, '5');
  assert.equal(current.projectionGeneration, '5');
  assert.equal(current.events.length, 2);
  assert.equal(audit.events.length, 5);
  assert.ok(audit.events.every((event) => event.version === 3 && event.payloadVersion === 1));
  assert.ok(replay.events.some((event) => event.eventId === created.eventIds[0]));
  return {
    accountId,
    symbol,
    deposit,
    created,
    replaced,
    voided,
    restored,
    current,
    audit,
    replay,
    idempotencyVerified: true,
    rejectedStaleRevision: conflict.error,
  };
}

export async function runOldLedgerHttpProbe(
  request: Request,
  accountId: string,
  eventId: string,
  symbol: string,
) {
  const command = probeExecution(accountId, symbol, `e03-d-old-${randomUUID()}`);
  const probes: Array<[string, unknown?]> = [
    [`/${accountId}/events`],
    [`/${accountId}/events/audit`],
    ['/executions', command],
    [
      '/executions/replace',
      {
        ...command,
        command: 'REPLACE_EXECUTION',
        expectedLedgerRevision: '0',
        supersedesEventId: eventId,
        reason: '旧记录拒绝验收',
      },
    ],
    [
      '/executions/void',
      {
        command: 'VOID_EXECUTION',
        accountId,
        expectedLedgerRevision: '0',
        supersedesEventId: eventId,
        reason: '旧记录拒绝验收',
        actorId: 'e03-d',
        source: command.source,
      },
    ],
  ];
  const results = [];
  for (const [path, body] of probes) {
    const error = apiErrorResponseSchema.parse(accepted(await request(path, body), 409));
    assert.equal(error.error, 'UNSUPPORTED_CONTRACT_VERSION');
    results.push({ path, status: 409, error: error.error });
  }
  return { accountId, results };
}
