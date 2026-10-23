import assert from 'node:assert/strict';
import { createRecoveryRuntime, Prisma, schemas } from './research-recovery-runtime.mjs';
import { controlledModel, workerPool } from './research-recovery-processes.mjs';
import { recoveryCases } from './research-recovery-cases.mjs';

const quote = name => '"' + name.replaceAll('"', '""') + '"';
async function tableDigest(prisma, table, omittedIds = [], idField = 'id') {
  assert(omittedIds.every(id => /^[a-f0-9-]{36}$/.test(id)));
  const where = omittedIds.length ? ` WHERE ${quote(idField)} NOT IN (${omittedIds.map(id => `'${id}'::uuid`).join(',')})` : '';
  const [row] = await prisma.$queryRawUnsafe(`SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) AS digest FROM (SELECT * FROM ${quote(table)}${where}) t`);
  return row.digest;
}

export async function runRecovery(sample, workerFile) {
  schemas.researchGenerationV2Schema.parse(sample.generation);
  const model = controlledModel(sample.generation), origin = await model.start();
  const runtime = await createRecoveryRuntime(origin), workers = workerPool(workerFile, origin);
  const previousWriteFlag = process.env.AI_RESEARCH_V2_WRITES_ENABLED;
  process.env.AI_RESEARCH_V2_WRITES_ENABLED = 'true';
  try {
    const tables = await runtime.prisma.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
    const before = Object.fromEntries(await Promise.all(tables.map(async row =>
      [row.tablename, await tableDigest(runtime.prisma, row.tablename)])));
    const result = await recoveryCases(runtime, model, workers, sample);
    const after = Object.fromEntries(await Promise.all(tables.map(async row =>
      [row.tablename, await tableDigest(runtime.prisma, row.tablename)])));
    const changedTables = Object.keys(after).filter(name => before[name] !== after[name]);
    assert(changedTables.every(name => ['AiRun', 'AiToolCall', 'AiRoutingSettings', 'AiInvocation', 'AiInvocationFact'].includes(name)),
      `受控执行改变非 AI 所有的表：${changedTables.join(',')}`);
    const ids = result.rows.map(row => row.id);
    assert.equal(await tableDigest(runtime.prisma, 'AiRun', ids), before.AiRun, '既有保存 Run 被改变');
    assert.equal(await tableDigest(runtime.prisma, 'AiToolCall', ids, 'aiRunId'), before.AiToolCall, '既有 Tool 审计被改变');
    const costs = await runtime.prisma.aiRun.findMany({ where: { id: { in: ids } }, select: { cost: true, inputTokens: true, outputTokens: true } });
    const cost = costs.reduce((sum, row) => sum.plus(row.cost), new Prisma.Decimal(0));
    assert.equal(cost.toString(), '0.21');
    await workers.close();
    assert.equal(workers.exits.filter(exit => exit.signal === 'SIGKILL').length, 4);
    assert(workers.exits.every(exit => exit.code === 0 || exit.signal === 'SIGKILL'));
    return { format: 'research-target-recovery-probe-v1', passed: true, ...result,
      changedTables, preservedOriginalTables: tables.length - changedTables.length,
      originalReportsUnchanged: true, originalToolAuditUnchanged: true,
      processExits: workers.exits, remainingChildren: 0,
      realModelRequests: 0, actualTransport: 'local-controlled-sse',
      syntheticSettlementCurrency: 'USD', syntheticSettlementAmount: cost.toString(),
      settledRequestCount: result.outcomes.flatMap(row => row.settledRevisions).reduce((sum, value) => sum + value, 0),
      inputTokens: costs.reduce((sum, row) => sum + row.inputTokens, 0),
      outputTokens: costs.reduce((sum, row) => sum + row.outputTokens, 0) };
  } finally {
    process.env.AI_RESEARCH_V2_WRITES_ENABLED = previousWriteFlag;
    await workers.close(); await model.close(); await runtime.close();
  }
}
