import assert from 'node:assert/strict';
import test from 'node:test';
import { assertExperimentAuthorization } from './research-live-experiment-authorization.mjs';
import { parseLiveExperimentArgs } from './research-live-experiment-args.mjs';

function fixture() {
  const model = { providerId: 'cloudflare', id: '@cf/qwen/qwen3.8-27b', revision: 'r1' };
  const pricing = {
    costPer1kInput: 0.00045,
    costPer1kOutput: 0.0032,
    costCurrency: 'USD',
    pricingVersion: 'r1',
  };
  const caseIds = [
    'single-price',
    'currencies',
    'future-publication',
    'dividend-proposal',
    'prompt-injection',
  ];
  return {
    protocol: {
      version: 'research-live-experiment-v4',
      model,
      pricing,
      caseIds,
      budget: { maxCost: '5', authorizedCalls: 68 },
    },
    initial: { requests: 48 },
    checkpoint: {
      authorizedModelRequestsTotal: 68,
      authorizedCostUSD: '5',
      cloudflareScreeningAuthorization: {
        providerId: 'cloudflare',
        model: model.id,
        modelRevision: model.revision,
        pricing,
        caseIds,
        initialLocalAttempts: 48,
        maxNewRequests: 20,
        maxCumulativeRequests: 68,
        cumulativeCostCapUSD: '5',
      },
    },
  };
}

test('只有明确五例20次/累计68及原5 USD授权才准入；缺失或漂移拒绝', () => {
  const v = fixture();
  assert.doesNotThrow(() => assertExperimentAuthorization(v.protocol, v.initial, v.checkpoint));
  const changes = [
    (v) => {
      v.checkpoint.authorizedModelRequestsTotal = 50;
    },
    (v) => {
      v.checkpoint.authorizedCostUSD = '0';
    },
    (v) => {
      delete v.checkpoint.cloudflareScreeningAuthorization;
    },
    (v) => {
      v.initial.requests = 49;
    },
    (v) => {
      v.checkpoint.cloudflareScreeningAuthorization.maxNewRequests = 21;
    },
    (v) => {
      v.checkpoint.cloudflareScreeningAuthorization.caseIds = ['other'];
    },
    (v) => {
      v.checkpoint.cloudflareScreeningAuthorization.modelRevision = 'other';
    },
    (v) => {
      v.checkpoint.cloudflareScreeningAuthorization.pricing = {
        ...v.protocol.pricing,
        costPer1kInput: 0,
      };
    },
    (v) => {
      v.protocol.budget.authorizedCalls = null;
    },
  ];
  for (const change of changes) {
    const value = fixture();
    change(value);
    assert.throws(() =>
      assertExperimentAuthorization(value.protocol, value.initial, value.checkpoint),
    );
  }
});

test('Cloudflare五例只允许固定Qwen加累计历史，不允许免费Schema继续策略', () => {
  const base = [
    '--provider=cloudflare',
    '--model=@cf/qwen/qwen3.8-27b',
    '--output=.recovery-artifacts/synthetic-cf',
  ];
  assert.throws(() => parseLiveExperimentArgs(base));
  assert.equal(
    parseLiveExperimentArgs([...base, '--history=prior']).selectedModel,
    '@cf/qwen/qwen3.8-27b',
  );
  assert.equal(
    parseLiveExperimentArgs([...base, '--continue=prior']).continuationArgument,
    '--continue=prior',
  );
  assert.throws(() =>
    parseLiveExperimentArgs([...base, '--history=prior', '--continue-confirmed-schema-failures']),
  );
  assert.throws(() =>
    parseLiveExperimentArgs([
      '--provider=cloudflare',
      '--model=@cf/other/model',
      '--history=prior',
      '--output=.recovery-artifacts/synthetic-cf',
    ]),
  );
});

test('Cloudflare49次续接必须有本次明确19次授权和精确来源，不能重复使用旧授权', () => {
  const make = () => {
    const v = fixture();
    v.initial.requests = 49;
    const source = {
      directory: '.recovery-artifacts/original-cloudflare-first-429',
      hashes: { 'result.json': 'a'.repeat(64) },
    };
    v.checkpoint.cloudflareContinuationAuthorization = {
      providerId: 'cloudflare',
      model: v.protocol.model.id,
      initialLocalAttempts: 49,
      maxNewRequests: 19,
      maxCumulativeRequests: 68,
      cumulativeCostCapUSD: '5',
      retainFailedSingle: true,
      firstNewStage: 'organize',
      stopOnAnyNewFailure: true,
      sourceProof: structuredClone(source),
      caseIds: [...v.protocol.caseIds],
    };
    return { ...v, source };
  };
  const v = make();
  assert.doesNotThrow(() =>
    assertExperimentAuthorization(v.protocol, v.initial, v.checkpoint, v.source),
  );
  for (const change of [
    (v) => {
      delete v.checkpoint.cloudflareContinuationAuthorization;
    },
    (v) => {
      v.source = null;
    },
    (v) => {
      v.initial.requests = 50;
    },
    (v) => {
      v.checkpoint.cloudflareContinuationAuthorization.maxNewRequests = 20;
    },
    (v) => {
      v.checkpoint.cloudflareContinuationAuthorization.maxCumulativeRequests = 69;
    },
    (v) => {
      v.checkpoint.cloudflareContinuationAuthorization.cumulativeCostCapUSD = '6';
    },
    (v) => {
      v.checkpoint.cloudflareContinuationAuthorization.retainFailedSingle = false;
    },
    (v) => {
      v.checkpoint.cloudflareContinuationAuthorization.firstNewStage = 'single';
    },
    (v) => {
      v.checkpoint.cloudflareContinuationAuthorization.stopOnAnyNewFailure = false;
    },
    (v) => {
      v.checkpoint.cloudflareContinuationAuthorization.sourceProof.hashes['result.json'] =
        'b'.repeat(64);
    },
    (v) => {
      v.checkpoint.cloudflareContinuationAuthorization.caseIds = ['other'];
    },
  ]) {
    const value = make();
    change(value);
    assert.throws(() =>
      assertExperimentAuthorization(value.protocol, value.initial, value.checkpoint, value.source),
    );
  }
});

test('优化协议必须匹配用户纠正、50次来源和原68次/5 USD，人工输出限制不能混入', () => {
  const make = () => {
    const v = fixture();
    v.initial.requests = 50;
    v.protocol = {
      ...v.protocol,
      version: 'research-live-experiment-v5',
      failurePolicy: 'record_and_continue',
      reasoningEffort: 'low',
      budget: { ...v.protocol.budget, modelContextTokens: 262144, outputTokenLimit: 'upstream' },
    };
    const historySource = {
      directory: '.recovery-artifacts/prior50',
      sourceReportSha256: 'a'.repeat(64),
    };
    v.checkpoint.cloudflareOptimizationAuthorization = {
      providerId: 'cloudflare',
      model: v.protocol.model.id,
      modelRevision: v.protocol.model.revision,
      initialLocalAttempts: 50,
      maxNewRequests: 18,
      maxCumulativeRequests: 68,
      cumulativeCostCapUSD: '5',
      outputTokenLimit: 'upstream',
      modelContextTokens: 262144,
      reasoningEffort: 'low',
      failurePolicy: 'record_and_continue',
      caseIds: [...v.protocol.caseIds],
      pricing: { ...v.protocol.pricing },
      historySource: structuredClone(historySource),
    };
    return { ...v, historySource };
  };
  const v = make();
  assert.doesNotThrow(() =>
    assertExperimentAuthorization(v.protocol, v.initial, v.checkpoint, null, v.historySource),
  );
  for (const change of [
    (v) => {
      delete v.checkpoint.cloudflareOptimizationAuthorization;
    },
    (v) => {
      v.initial.requests = 51;
    },
    (v) => {
      v.checkpoint.cloudflareOptimizationAuthorization.maxNewRequests = 19;
    },
    (v) => {
      v.checkpoint.cloudflareOptimizationAuthorization.maxCumulativeRequests = 69;
    },
    (v) => {
      v.checkpoint.cloudflareOptimizationAuthorization.cumulativeCostCapUSD = '6';
    },
    (v) => {
      v.checkpoint.cloudflareOptimizationAuthorization.modelRevision = 'other';
    },
    (v) => {
      v.checkpoint.cloudflareOptimizationAuthorization.outputTokenLimit = '2000';
    },
    (v) => {
      v.checkpoint.cloudflareOptimizationAuthorization.failurePolicy = 'stop_all_new_failures';
    },
    (v) => {
      v.historySource.sourceReportSha256 = 'b'.repeat(64);
    },
    (v) => {
      v.historySource = null;
    },
  ]) {
    const x = make();
    change(x);
    assert.throws(() =>
      assertExperimentAuthorization(x.protocol, x.initial, x.checkpoint, null, x.historySource),
    );
  }
});

test('优化CLI只接受Cloudflare明确型号与历史，不复用旧429接续或免费停止策略', () => {
  const base = [
    '--iterate',
    '--provider=cloudflare',
    '--model=@cf/qwen/qwen3.8-27b',
    '--history=prior50',
    '--output=.recovery-artifacts/synthetic-iterate',
  ];
  assert.equal(parseLiveExperimentArgs(base).iterate, true);
  assert.throws(() => parseLiveExperimentArgs(base.filter((x) => !x.startsWith('--history='))));
  assert.throws(() => parseLiveExperimentArgs(base.filter((x) => !x.startsWith('--model='))));
  assert.throws(() => parseLiveExperimentArgs([...base, '--iterate']));
  assert.throws(() => parseLiveExperimentArgs([...base, '--continue-confirmed-schema-failures']));
  assert.throws(() =>
    parseLiveExperimentArgs(
      base.map((x) => (x === '--provider=cloudflare' ? '--provider=openrouter' : x)),
    ),
  );
});
