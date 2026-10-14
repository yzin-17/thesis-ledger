import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { AiRunService } from '../../../dist/src/ai/ai-run.service.js';
import { AiExecutionStateStore } from '../../../dist/src/ai/ai-execution-state.store.js';

const [phase, runId, requestState, providerOrigin] = process.argv.slice(2);
const url = new URL(process.env.AI_PROVIDER_DATABASE_URL ?? '');
if (url.hostname !== '127.0.0.1' || url.pathname !== '/ai_provider_concurrency_fixture')
  throw new Error('独立恢复进程只允许专用隔离数据库');
const prisma = new PrismaClient({ datasourceUrl: url.toString() });
const identity = await prisma.$queryRaw`SELECT current_database() AS name, current_user AS owner`;
if (
  identity[0]?.name !== 'ai_provider_concurrency_fixture' ||
  identity[0]?.owner !== 'fixture_owner'
)
  throw new Error('独立恢复进程数据库身份不符');
const runs = new AiRunService(prisma);
const store = new AiExecutionStateStore(prisma);
if (phase === 'recover') {
  await runs.recoverStaleRuns();
  const claimed = await runs.claim(runId);
  const row = await prisma.aiRun.findUniqueOrThrow({ where: { id: runId } });
  console.log(
    JSON.stringify({
      phase,
      pid: process.pid,
      status: row.status,
      attempt: row.executionAttempt,
      errorCode: row.errorCode,
      claimed: claimed !== null,
    }),
  );
  await prisma.$disconnect();
} else {
  let requestId;
  if (requestState !== 'queued') {
    const claimed = await runs.claim(runId, 250);
    if (!claimed) throw new Error('隔离任务领取失败');
    requestId = randomUUID();
    await store.prepareRequest({
      runId,
      executionAttempt: claimed.executionAttempt,
      requestId,
      reservation: {
        aiCalls: 1,
        inputTokens: 10,
        outputTokens: 10,
        provider: 'fixture',
        model: 'fixture-model',
        configurationFingerprint: 'fixture-fingerprint',
        cost: {
          status: 'unknown',
          amount: null,
          currency: null,
          source: 'provider_cost_unavailable',
          pricingVersion: null,
        },
      },
    });
    if (requestState === 'dispatched') {
      await store.authorizeDispatch(
        { runId, executionAttempt: claimed.executionAttempt },
        requestId,
      );
      const provider = new URL(providerOrigin);
      if (provider.hostname !== '127.0.0.1' || provider.protocol !== 'http:')
        throw new Error('恢复传输只允许本机固定输入服务');
      void fetch(provider, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId, requestId }),
      }).catch(() => undefined);
    }
  }
  console.log(JSON.stringify({ phase, pid: process.pid, requestId, ready: true }));
  setInterval(() => undefined, 1000);
}
