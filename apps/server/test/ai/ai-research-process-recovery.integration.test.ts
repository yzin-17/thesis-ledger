import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { aiGenerationContracts, DEFAULT_AI_RESEARCH_POLICY_V1 } from '@thesis-ledger/schemas';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AiExecutionStateStore } from '../../src/ai/ai-execution-state.store.js';
import { aiExecutionReadModel } from '../../src/ai/ai-execution-read-model.js';
import { assertIsolated, databaseUrl } from './ai-provider-postgres.fixture.js';

const childFile = fileURLToPath(
  new URL('./fixtures/research-recovery-process.mjs', import.meta.url),
);
const processes = new Set<ChildProcess>();
const start = (phase: string, runId: string, state = '', origin = '') => {
  const child = spawn(process.execPath, [childFile, phase, runId, state, origin], {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  processes.add(child);
  let errors = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    errors += chunk.toString();
  });
  const ready = new Promise<Record<string, unknown>>((resolve, reject) => {
    let output = '';
    const timer = setTimeout(
      () => reject(new Error(`恢复进程未就绪：${errors.slice(-1000)}`)),
      5000,
    );
    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      if (!output.includes('\n')) return;
      clearTimeout(timer);
      resolve(JSON.parse(output.split('\n')[0]!) as Record<string, unknown>);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`恢复进程退出 ${code}：${errors.slice(-1000)}`));
    });
  });
  return { child, ready };
};

describe.skipIf(!databaseUrl)('研究独立服务进程终止与恢复', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl ?? '' });
  const store = new AiExecutionStateStore(prisma as never);
  const runIds: string[] = [];
  const received = new Map<string, number>();
  const provider = createServer(async (request) => {
    let body = '';
    for await (const chunk of request) body += String(chunk);
    const { runId } = JSON.parse(body) as { runId: string };
    received.set(runId, (received.get(runId) ?? 0) + 1);
    // 收到请求后不返回结果，让强制退出发生在真实传输的未知结果窗口。
  });
  let origin: string;
  beforeAll(async () => {
    await assertIsolated(prisma);
    provider.listen(0, '127.0.0.1');
    await once(provider, 'listening');
    origin = `http://127.0.0.1:${(provider.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    for (const child of processes)
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    provider.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      provider.close((error) => (error ? reject(error) : resolve())),
    );
    await prisma.aiRun.deleteMany({ where: { id: { in: runIds } } });
    await prisma.$disconnect();
  });
  it.each(['queued', 'prepared', 'dispatched'])(
    '%s 记录在强制退出后由新进程安全收敛',
    async (state) => {
      const run = await prisma.aiRun.create({
        data: {
          provider: 'fixture',
          model: 'fixture-model',
          promptVersion: 'research-v1',
          status: 'queued',
          modelMetadata: {
            sdkExecution: {
              version: 'sdk-execution-v1',
              contract: aiGenerationContracts.research.ref,
              frozenPolicy: DEFAULT_AI_RESEARCH_POLICY_V1,
              deadlineAt: new Date(Date.now() + 60000).toISOString(),
              generationStatus: 'pending',
              usageCompleteness: 'unknown',
              requests: [],
              continuationBlockedReason: null,
            },
          },
        },
      });
      runIds.push(run.id);
      const first = start('hold', run.id, state, origin);
      const initial = await first.ready;
      expect(initial.ready).toBe(true);
      if (state === 'dispatched') await vi.waitFor(() => expect(received.get(run.id)).toBe(1));
      const exited = once(first.child, 'exit');
      first.child.kill('SIGKILL');
      expect(await exited).toEqual([null, 'SIGKILL']);
      if (state !== 'queued')
        await vi.waitFor(async () => {
          const row = await prisma.aiRun.findUniqueOrThrow({ where: { id: run.id } });
          expect(row.leaseUntil!.getTime()).toBeLessThan(Date.now());
        });
      const second = start('recover', run.id);
      const recovered = await second.ready;
      expect(recovered.pid).not.toBe(initial.pid);
      if (second.child.exitCode === null) await once(second.child, 'exit');
      if (state === 'dispatched') {
        expect(recovered).toMatchObject({
          status: 'failed',
          attempt: 1,
          errorCode: 'research_unknown_outcome',
          claimed: false,
        });
      } else {
        expect(recovered).toMatchObject({
          status: 'running',
          attempt: state === 'queued' ? 1 : 2,
          claimed: true,
        });
      }
      if (state !== 'queued')
        expect(
          await store.authorizeDispatch(
            { runId: run.id, executionAttempt: 1 },
            initial.requestId as string,
          ),
        ).toBe(false);
      const row = await prisma.aiRun.findUniqueOrThrow({ where: { id: run.id } });
      expect(row.result).toBeNull();
      expect(received.get(run.id) ?? 0).toBe(state === 'dispatched' ? 1 : 0);
      const execution = aiExecutionReadModel(row.modelMetadata);
      expect(execution?.usageCompleteness).toBe('unknown');
      for (const request of execution?.requests ?? []) expect(request.usage).toBeNull();
    },
    15000,
  );
});
