import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { aiGenerationContracts } from '@thesis-ledger/schemas';
import { expect, it } from 'vitest';
import { AiAdaptiveExecution } from '../../src/ai/adaptive/ai-adaptive-execution.js';
import { AiSdkGenerationAdapter } from '../../src/ai/ai-sdk-generation.adapter.js';
import { AiTraceFileStore } from '../../src/ai/trace/ai-trace-file-store.js';
import { AiExecutionTrace } from '../../src/ai/trace/ai-execution-trace.js';
import {
  createAiTraceReference,
  type AiTraceManifest,
} from '../../src/ai/trace/ai-trace-contract.js';
import { withAiTraceScope } from '../../src/ai/trace/ai-trace-context.js';
import { traceSse } from './ai-trace.fixture.js';

it('自适应决策可从真实SDK trace反读，策略字段不进入上游JSON', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ai-adaptive-trace-'));
  try {
    const store = new AiTraceFileStore(root),
      reference = createAiTraceReference();
    const identity = { runId: randomUUID(), ownerId: randomUUID(), executionAttempt: 1 };
    const manifest: AiTraceManifest = {
      ...reference,
      ...identity,
      startedAt: new Date().toISOString(),
      completedAt: null,
      status: 'running',
      captureStatus: 'complete',
      nativeFetches: 0,
      nodes: [],
      artifacts: [],
      issues: [],
    };
    const trace = new AiExecutionTrace(manifest, await store.open(reference, identity));
    let wire: Record<string, unknown> = {};
    await withAiTraceScope({ trace }, () =>
      new AiAdaptiveExecution().generate(
        new AiSdkGenerationAdapter(),
        {
          requestId: randomUUID(),
          adapter: 'openai-compatible-chat',
          providerId: 'fixture',
          baseURL: 'https://fixture.invalid/v1',
          apiKey: 'PRIVATE_ADAPTIVE_KEY',
          model: 'fixture-model',
          messages: [{ role: 'user', content: 'fixture' }],
          contract: aiGenerationContracts.research.ref,
          schema: aiGenerationContracts.research.schema,
          mode: 'json_validated',
          transport: 'stream',
          timeout: { totalMs: 300_000, firstChunkMs: 30_000, chunkMs: 30_000 },
          signal: new AbortController().signal,
          httpClient: async (_url, options) => {
            wire = JSON.parse(String(options?.body)) as Record<string, unknown>;
            return new Response(traceSse(), {
              status: 200,
              headers: { 'content-type': 'text/event-stream' },
            });
          },
        },
        {
          configurationFingerprint: 'fixture-fingerprint',
          firstOutputTimeoutSource: 'system',
          outputIdleTimeoutSource: 'system',
        },
        Date.now() + 300_000,
      ),
    );
    await trace.finish('succeeded');
    const found = await store.read(reference, identity);
    const sdk = found.manifest.nodes.find((node) => node.stage === 'sdk.generate')!;
    expect(found.artifacts[sdk.input!.file]!.value).toMatchObject({
      adaptiveExecution: {
        version: 'ai-adaptive-v2-shadow',
        mode: 'shadow',
        applied: false,
        first: { samples: 0, applied: false },
      },
      maxRetries: 0,
    });
    expect(wire).toMatchObject({ model: 'fixture-model', stream: true });
    expect(wire).not.toHaveProperty('adaptiveExecution');
    expect(wire).not.toHaveProperty('timeout');
    expect(found.manifest).toMatchObject({ captureStatus: 'complete', nativeFetches: 1 });
    expect(JSON.stringify(found)).not.toContain('PRIVATE_ADAPTIVE_KEY');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
