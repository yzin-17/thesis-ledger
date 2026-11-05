import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  readLMStudioExperimentInput,
  mergeLMStudioProbeHistory,
  sha256,
  localBaseURL,
  localModel,
  localCanonicalModel,
} from './research-lmstudio-experiment-input.mjs';

function fixture() {
  const directory = mkdtempSync(resolve('.recovery-artifacts/lmstudio-input-test-'));
  const write = (file, value) => writeFileSync(file, JSON.stringify(value));
  const provider = {
    name: 'lmstudio',
    baseUrl: localBaseURL,
    authMode: 'none',
    upstreamFormat: 'chat-completions',
    chatImplementation: 'compatible',
    models: [localModel],
    timeoutMs: 30000,
    executionRoutes: [
      {
        model: localModel,
        contract: { id: 'research' },
        adapter: 'openai-compatible-chat',
        mode: 'native_schema',
      },
    ],
    modelDefaults: {
      [localModel]: {
        requestOptions: { headers: { 'x-observation': 'saved' }, body: { temperature: 0.2 } },
      },
    },
    modelPricing: {
      [localModel]: {
        costPer1kInput: 0,
        costPer1kOutput: 0,
        costCurrency: 'USD',
        pricingVersion: 'saved-zero',
      },
    },
  };
  const source = join(directory, 'source.json');
  write(source, provider);
  const file = join(directory, 'saved.json');
  write(file, { source, sourceSha256: sha256(JSON.stringify(provider)), provider });
  const catalog = {
    models: [
      {
        key: localCanonicalModel,
        quantization: { name: 'Q4_K_M' },
        max_context_length: 262144,
        loaded_instances: [{ config: { context_length: 102400 } }],
      },
    ],
  };
  const http = async (_url, init) => {
    assert.equal(init.method, 'GET');
    return new Response(JSON.stringify(catalog), { status: 200 });
  };
  const base = {
    history: {
      requests: 68,
      unknownRequests: 9,
      amount: '0.51597575',
      reservedUnknown: '0.2568',
      unknownReservations: [],
    },
    requestIds: ['old-id'],
    sourceProof: { directory: 'old' },
  };
  write(join(directory, 'summary.json'), {
    priorOriginalExperimentPostAttempts: 68,
    modelPostAttemptsAdded: 2,
    allLocalModelPostAttemptsIncludingNewProbe: 70,
  });
  for (const [index, attempt] of ['attempt-1', 'attempt-2'].entries()) {
    const folder = join(directory, attempt);
    mkdirSync(folder);
    const requestId = randomUUID();
    write(join(folder, 'probe-result.json'), {
      providerId: 'lmstudio',
      baseURL: localBaseURL,
      requestedModel: localModel,
      pricing: provider.modelPricing[localModel],
      previousExperimentAttempts: 68,
      originalExperimentPointerUnchanged: true,
      modelRequestsAdded: 1,
      status: index ? 'passed' : 'failed',
      result: { usage: { status: 'reported' }, finishReason: 'stop' },
      estimatedCostUSD: 0,
      error: { fact: { externalResult: 'unknown' } },
    });
    write(join(folder, 'request-journal.json'), [
      { requestId, method: 'POST', url: localBaseURL + '/chat/completions' },
    ]);
    write(join(folder, 'wire-request-settings.json'), { sentAuthorization: false });
  }
  return {
    directory,
    file,
    provider,
    catalog,
    http,
    base,
    write,
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}

test('只读目录后冻结实际加载上下文，按保存参数和型号消费', async () => {
  const v = fixture();
  try {
    const result = await readLMStudioExperimentInput(v.file, v.http);
    assert.equal(result.modelContextTokens, 102400);
    assert.deepEqual(result.generation, {
      adapter: 'openai-compatible-chat',
      mode: 'native_schema',
    });
    assert.deepEqual(result.requestOptions, v.provider.modelDefaults[localModel].requestOptions);
  } finally {
    v.cleanup();
  }
});

test('配置非零费率在任何网络请求前拒绝', async () => {
  const v = fixture();
  try {
    v.provider.modelPricing[localModel].costPer1kOutput = 1;
    const bytes = JSON.stringify(v.provider);
    writeFileSync(join(v.directory, 'source.json'), bytes);
    v.write(v.file, {
      source: join(v.directory, 'source.json'),
      sourceSha256: sha256(bytes),
      provider: v.provider,
    });
    let calls = 0;
    await assert.rejects(
      readLMStudioExperimentInput(v.file, async () => {
        calls++;
        throw Error('不应派发');
      }),
    );
    assert.equal(calls, 0);
  } finally {
    v.cleanup();
  }
});

test('目录量化变化在模型派发前拒绝', async () => {
  const v = fixture();
  try {
    v.catalog.models[0].quantization.name = 'Q8_0';
    await assert.rejects(readLMStudioExperimentInput(v.file, v.http), /量化/);
  } finally {
    v.cleanup();
  }
});

test('历史68次加两次探针为70，保留未知Token及原费用预留', () => {
  const v = fixture();
  try {
    const merged = mergeLMStudioProbeHistory(v.base, v.directory, (value) =>
      sha256(JSON.stringify(value)),
    );
    assert.equal(merged.history.requests, 70);
    assert.equal(merged.history.unknownRequests, 10);
    assert.equal(merged.history.reservedUnknown, '0.2568');
    assert.equal(merged.history.amount, '0.51597575');
    assert.equal(merged.history.unknownReservations.at(-1).costPer1kOutput, 0);
  } finally {
    v.cleanup();
  }
});

test('丢失或重复探针记录不能绕过全局计量', () => {
  const v = fixture();
  try {
    v.write(join(v.directory, 'attempt-2/request-journal.json'), [
      { requestId: 'old-id', method: 'POST', url: localBaseURL + '/chat/completions' },
    ]);
    assert.throws(
      () =>
        mergeLMStudioProbeHistory(v.base, v.directory, (value) => sha256(JSON.stringify(value))),
      /重复/,
    );
  } finally {
    v.cleanup();
  }
});
