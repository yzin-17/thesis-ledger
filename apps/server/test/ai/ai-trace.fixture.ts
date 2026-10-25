import { randomUUID } from 'node:crypto';
import { aiGenerationContracts, type AiExecutionSummary } from '@thesis-ledger/schemas';
import { vi } from 'vitest';
import { AiExecutionStateStore } from '../../src/ai/ai-execution-state.store.js';
import { AiTraceCaptureService } from '../../src/ai/trace/ai-trace-capture.service.js';
import { createAiTraceReference } from '../../src/ai/trace/ai-trace-contract.js';
import { AiTraceFileStore } from '../../src/ai/trace/ai-trace-file-store.js';

export const traceContent = JSON.stringify({
  conclusion: '受控研究结果',
  evidence: [],
  risks: [],
  unknowns: [],
  disclaimer: '离线样例',
  signals: [],
});
export const traceSse = (content = traceContent) => {
  const common = {
    id: 'gen-offline-trace',
    model: 'fixture-model',
    object: 'chat.completion.chunk',
    created: 1,
  };
  const event = (choices: unknown[], extra = {}) =>
    `data: ${JSON.stringify({ ...common, choices, ...extra })}\n\n`;
  return (
    event([{ index: 0, delta: { reasoning: 'PRIVATE_REASONING' }, finish_reason: null }]) +
    event([{ index: 0, delta: { content }, finish_reason: null }]) +
    event([{ index: 0, delta: {}, finish_reason: 'stop' }]) +
    event([], { usage: { prompt_tokens: 9, completion_tokens: 6, total_tokens: 15 } }) +
    'data: [DONE]\n\n'
  );
};

/** 内存数据库只实现测试调用的事务边界；使用生产 StateStore 的 CAS/结算函数，不连接目标库。 */
export function traceFixture(root: string, selected = true, files = new AiTraceFileStore(root)) {
  const reference = createAiTraceReference();
  const execution: AiExecutionSummary = {
    version: 'sdk-execution-v1',
    contract: aiGenerationContracts.research.ref,
    frozenPolicy: {
      version: 'research-policy-v1',
      maxAiCalls: 1,
      maxInputTokens: 100000,
      maxOutputTokens: 20000,
      maxDurationSeconds: 60,
      maxCost: '0',
      costCurrency: null,
      paidRoutes: [],
    },
    deadlineAt: new Date(Date.now() + 60000).toISOString(),
    generationStatus: 'pending',
    usageCompleteness: 'unknown',
    requests: [],
    continuationBlockedReason: null,
  };
  const run = {
    id: randomUUID(),
    researchOwnerId: randomUUID(),
    executionAttempt: 1,
    status: 'running',
    leaseUntil: new Date(Date.now() + 60000),
    question: '受控问题',
    context: { scope: 'portfolio' },
    promptVersion: 'research-v1',
    provider: 'fixture',
    model: 'fixture-model',
    result: null as unknown,
    errorCode: null as string | null,
    errorSummary: null as string | null,
    completedAt: null as Date | null,
    modelMetadata: {
      sdkExecution: execution,
      researchRoutes: [
        {
          provider: 'fixture',
          model: 'fixture-model',
          configurationFingerprint: 'fixture-fingerprint',
        },
      ],
      ...(selected ? { diagnosticTrace: reference } : {}),
    },
  };
  const database = {
    $queryRaw: vi.fn(async () => [run]),
    aiRun: {
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(run, data);
        return run;
      }),
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        Object.entries(where).every(([key, value]) => run[key as keyof typeof run] === value)
          ? run
          : null,
      ),
    },
  };
  const prisma = {
    ...database,
    $transaction: async (work: (tx: typeof database) => Promise<unknown>) => work(database),
  };
  const store = new AiExecutionStateStore(prisma as never);
  const capture = new AiTraceCaptureService(prisma as never, store, files);
  const identity = { runId: run.id, ownerId: run.researchOwnerId, executionAttempt: 1 };
  return {
    reference,
    identity,
    run,
    database,
    store,
    capture,
    files,
    read: () => files.read(reference, identity),
  };
}
