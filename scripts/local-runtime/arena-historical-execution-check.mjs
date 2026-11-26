import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

export function acceptedDecision(receipt) {
  assert.equal(receipt.mode, 'send');
  assert.equal(receipt.realModelCalls, 1);
  assert.equal(receipt.automaticRetries, 0);
  assert.equal(receipt.identity.accepted, true);
  assert.equal(receipt.result.rawFinishReason, 'stop');
  assert.equal(receipt.result.output.action, 'decision');
  assert.equal(receipt.providerUnchanged, true);
  assert.equal(receipt.businessUnchanged, true);
  return receipt.result.output.decision;
}

export function allowHistoricalFetch(url, origin) {
  const parsed = new URL(url);
  assert.equal(parsed.origin, origin, '验收仅允许访问配置中的 DSA');
  assert(parsed.pathname.startsWith('/api/'), '验收请求须经过 DSA API');
  assert(!/chat|completions|generate|models/i.test(parsed.pathname), '禁止模型请求');
}

export async function checkHistoricalExecution(receipt, requests) {
  const decision = acceptedDecision(receipt);
  const { PrismaClient } = await import('@prisma/client');
  const sha = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
  const db = new PrismaClient();
  const read = () =>
    db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const [cycle] = await tx.$queryRaw`SELECT input FROM "ArenaLiveCycle"
      WHERE id='7e155817-ccfc-45bc-b812-01d9b8906beb'::uuid`;
      const rows = {};
      for (const table of [
        'ArenaLiveMatch',
        'ArenaLiveAgent',
        'ArenaLiveCycle',
        'ArenaLiveTimeline',
        'ProviderConfig',
      ]) {
        rows[table] = await tx.$queryRawUnsafe(
          `SELECT to_jsonb(t) AS value FROM "${table}" t ORDER BY to_jsonb(t)::text`,
        );
      }
      rows.calls = await tx.$queryRaw`SELECT (SELECT count(*)::int FROM "AiInvocation") calls,
      (SELECT count(*)::int FROM "AiInvocationFact") facts`;
      return { input: cycle.input, digest: sha(rows), calls: rows.calls };
    });
  const originalFetch = globalThis.fetch;
  try {
    const before = await read();
    assert.equal(before.input.asOf, receipt.asOf);
    const entrant = before.input.protocol.entrants.find(
      (x) => x.providerId === receipt.binding.providerId,
    );
    assert.equal(entrant?.model, receipt.binding.model);
    const { loadConfig } = await import('./dist/src/platform/config.js');
    const origin = new URL(loadConfig().dsaBaseUrl).origin;
    const calls = [];
    globalThis.fetch = async (url, init) => {
      allowHistoricalFetch(url, origin);
      calls.push({ path: new URL(url).pathname, method: init?.method ?? 'GET' });
      return originalFetch(url, { ...init, redirect: 'error' });
    };
    const tools = await collectIsolatedToolResults(before.input, requests);
    let validation;
    try {
      validation = await validateIsolatedDecision(before.input, decision);
    } catch (error) {
      validation = { status: 'blocked', reason: error.message.slice(0, 500), persistence: 'none' };
    }
    const after = await read();
    assert.equal(after.digest, before.digest, '业务或提供方发生并行变化，验收不能收口');
    const artifacts = Object.fromEntries(
      [
        'market/market-arena-history-source',
        'market/market-arena-replay-reader',
        'integration/dsa/dsa-historical-execution',
      ].map((name) => [
        name,
        createHash('sha256')
          .update(readFileSync(`./dist/src/${name}.js`))
          .digest('hex'),
      ]),
    );
    return {
      status: validation.status,
      asOf: receipt.asOf,
      reusedRequestId: receipt.requestId,
      realModelCalls: 0,
      automaticRetries: 0,
      businessUnchanged: true,
      providerUnchanged: true,
      businessBefore: before.digest,
      businessAfter: after.digest,
      invocationCounts: after.calls,
      artifacts,
      calls,
      tools: tools.toolResults,
      validation,
    };
  } finally {
    globalThis.fetch = originalFetch;
    await db.$disconnect();
  }
}
