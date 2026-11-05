import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import {
  readFreeProbeLedger,
  assertCurrentExperimentBudget,
} from './research-live-experiment-supplemental.mjs';
import { mergeHistoryProbeBudget } from './research-live-experiment-history-input.mjs';

test('跨型号只合并尚未覆盖的补充测试，不复用旧组或重复已有补充请求', () => {
  const v = namedFixture();
  try {
    const history = { history: { requests: 24 }, requestIds: [], supplementalRequestIds: [] };
    const pending = mergeHistoryProbeBudget(history, [v.reference]);
    assert.equal(pending.history.requests, 24);
    assert.equal(pending.supplementalBudget.entries.length, 1);
    assert.equal(
      pending.supplementalBudgetFrom[0].confirmationSHA256,
      v.reference.confirmationSHA256,
    );
    const covered = mergeHistoryProbeBudget(
      { ...history, supplementalRequestIds: [v.result.requestId] },
      [v.reference],
    );
    assert.equal(covered.supplementalBudget, undefined);
    assert.deepEqual(covered.supplementalBudgetFrom, []);
    assert.throws(() =>
      mergeHistoryProbeBudget({ ...history, requestIds: [v.result.requestId] }, [v.reference]),
    );
  } finally {
    rmSync(v.root, { recursive: true, force: true });
  }
});

function fixture() {
  const root = mkdtempSync(resolve('.recovery-artifacts/supplemental-test-'));
  const base = join(root, 'base'),
    probe = join(root, 'probe');
  mkdirSync(base);
  mkdirSync(probe);
  const target = { state: 'same' };
  const prior = {
    realRequestsTotal: 24,
    protectedUnchanged: true,
    after: target,
    report: { budget: { committed: '0.3232176', reservedUnknown: '0.1926' } },
  };
  const body = {
    model: 'openrouter/free',
    messages: [{ role: 'user', content: 'OK' }],
    max_tokens: 64,
  };
  const hash = (value) => createHash('sha256').update(value).digest('hex');
  const initialBudget = {
    artifactRoot: base,
    realRequestsTotal: 24,
    conservativeOccupiedUSD: '0.3232176',
    conservativeUnknownReservedUSD: '0.1926',
  };
  const sealed = {
    body,
    bodySHA256: hash(JSON.stringify(body)),
    catalog: { pricing: { prompt: '0', completion: '0' } },
    authorization: {
      thisProbeMaxRequests: 1,
      cumulativeMaxRequests: 50,
      cumulativeMaxCostUSD: '5',
    },
    initialBudget,
  };
  const result = {
    requestId: '00000000-0000-4000-8000-000000000001',
    modelRequests: 1,
    status: 'successful_response',
    requestedModel: 'openrouter/free',
    http: { status: 200 },
    finishReason: 'stop',
    response: { exactOK: true },
    providerReportedCostUSD: '0',
    usageKnown: true,
    actualModelCatalogZeroPrice: true,
    protectedUnchanged: true,
    completedAt: new Date().toISOString(),
    usage: { inputTokens: 10, outputTokens: 50 },
    initialCumulativeRequests: 24,
    realRequestsTotal: 25,
    before: target,
    after: target,
    budget: { occupiedUSD: '0.3232176', unknownReservedUSD: '0.1926' },
  };
  const reference = { directory: probe, resultSHA256: '' };
  const save = () => {
    writeFileSync(join(base, 'result.json'), JSON.stringify(prior));
    writeFileSync(join(probe, 'sealed-request.json'), JSON.stringify(sealed));
    writeFileSync(join(probe, 'result.json'), JSON.stringify(result));
    reference.resultSHA256 = hash(readFileSync(join(probe, 'result.json')));
  };
  save();
  return { root, base, probe, prior, sealed, result, reference, save };
}

function namedFixture() {
  const v = fixture();
  const model = 'nvidia/nemotron-3.5-super-vl:free';
  const canonical = 'nvidia/nemotron-3.5-super-vl-20261015';
  Object.assign(v.result, {
    version: 'research-named-free-probe-v1',
    requestedModel: model,
    canonicalModel: canonical,
    actualModel: model,
    actualModelMatches: true,
    jsonValid: true,
    schemaValid: true,
    response: { exactObject: { ok: true } },
    providerGenerationId: 'gen-12345-example',
  });
  v.sealed.body.model = model;
  v.sealed.body.response_format = {
    type: 'json_schema',
    json_schema: {
      name: 'availability_probe',
      strict: true,
      schema: {
        type: 'object',
        properties: { ok: { type: 'boolean', const: true } },
        required: ['ok'],
        additionalProperties: false,
      },
    },
  };
  Object.assign(v.sealed.catalog, { id: model, canonicalId: canonical });
  v.confirmation = {
    metadata: {
      httpStatus: 200,
      id: v.result.providerGenerationId,
      model: canonical + ':free',
      totalCostUSD: '0',
      inputTokens: 10,
      outputTokens: 50,
      finishReason: 'stop',
    },
    protectedUnchanged: true,
    after: v.result.after,
  };
  const originalSave = v.save;
  const hash = (value) => createHash('sha256').update(value).digest('hex');
  v.save = () => {
    originalSave();
    v.sealed.bodySHA256 = hash(JSON.stringify(v.sealed.body));
    v.sealed.baseResultSHA256 = hash(readFileSync(join(v.base, 'result.json')));
    originalSave();
    const bytes = JSON.stringify(v.confirmation);
    writeFileSync(join(v.probe, 'readonly-after-probe.json'), bytes);
    v.reference.confirmationSHA256 = hash(bytes);
  };
  v.save();
  return v;
}

test('命名免费型号只转移已核实计量，确认摘要可随历史重复读取', () => {
  const v = namedFixture();
  try {
    const ledger = readFreeProbeLedger([v.reference]);
    assert.equal(ledger.requests, 1);
    assert.equal(ledger.sourceProof[0].confirmationSHA256, v.reference.confirmationSHA256);
    assert.deepEqual(readFreeProbeLedger(ledger.sourceProof).budget, ledger.budget);
    assert.throws(() => readFreeProbeLedger([v.reference, v.reference]));
    assert.throws(() => readFreeProbeLedger([v.reference], new Set([v.result.requestId])));
    writeFileSync(join(v.probe, 'readonly-after-probe.json'), '{}');
    assert.throws(() => readFreeProbeLedger(ledger.sourceProof));
  } finally {
    rmSync(v.root, { recursive: true, force: true });
  }
});

test('命名测试拒绝型号、Schema、生成ID、用量、费用和保护状态漂移', () => {
  const mutations = [
    (v) => {
      v.result.actualModel = 'other/model:free';
    },
    (v) => {
      v.result.schemaValid = false;
    },
    (v) => {
      v.result.response.exactObject = { ok: true, extra: 1 };
    },
    (v) => {
      v.sealed.body.response_format.json_schema.schema.additionalProperties = true;
    },
    (v) => {
      v.confirmation.metadata.id = 'gen-different';
    },
    (v) => {
      v.confirmation.metadata.model = 'other/model:free';
    },
    (v) => {
      v.confirmation.metadata.inputTokens += 1;
    },
    (v) => {
      v.confirmation.metadata.totalCostUSD = '0.01';
    },
    (v) => {
      v.confirmation.metadata.finishReason = 'length';
    },
    (v) => {
      v.result.providerReportedCostUSD = null;
    },
    (v) => {
      v.result.usageKnown = false;
    },
    (v) => {
      v.confirmation.protectedUnchanged = false;
    },
    (v) => {
      v.confirmation.after = { state: 'different' };
    },
  ];
  for (const mutate of mutations) {
    const v = namedFixture();
    try {
      mutate(v);
      v.save();
      assert.throws(() => readFreeProbeLedger([v.reference]));
    } finally {
      rmSync(v.root, { recursive: true, force: true });
    }
  }
});

test('补充成功文本测试仅转移一次0费用预算，原未知预留保持', () => {
  const v = fixture();
  try {
    const read = readFreeProbeLedger([v.reference]);
    assert.equal(read.requests, 1);
    assert.equal(read.budget.entries[0].providerReportedCostUSD, '0');
    assert.equal(read.sourceProof.length, 1);
    assert.deepEqual(readFreeProbeLedger(read.sourceProof).budget, read.budget);
    const checkpoint = {
      localModelPostAttemptsTotal: 25,
      realRequestsTotal: 25,
      conservativeOccupiedUSD: '0.32321760',
      conservativeUnknownReservedUSD: '0.19260',
    };
    assertCurrentExperimentBudget(
      { requests: 25, amount: '0.3232176', reservedUnknown: '0.1926' },
      checkpoint,
    );
    assert.throws(() =>
      assertCurrentExperimentBudget(
        { requests: 24, amount: '0.3232176', reservedUnknown: '0.1926' },
        checkpoint,
      ),
    );
    assert.throws(() =>
      assertCurrentExperimentBudget(
        { requests: 25, amount: '0.3232176', reservedUnknown: '0' },
        checkpoint,
      ),
    );
  } finally {
    rmSync(v.root, { recursive: true, force: true });
  }
});

test('拒绝缺失、重复、摘要漂移、未知用量/费用及不一致累计起点', () => {
  const mutations = [
    (v) => {
      v.result.providerReportedCostUSD = null;
    },
    (v) => {
      v.result.providerReportedCostUSD = '0.01';
    },
    (v) => {
      v.result.usageKnown = false;
    },
    (v) => {
      v.result.modelRequests = 2;
    },
    (v) => {
      v.result.realRequestsTotal = 24;
    },
    (v) => {
      v.result.protectedUnchanged = false;
    },
    (v) => {
      v.sealed.catalog.pricing.prompt = '0.01';
    },
    (v) => {
      v.result.budget.unknownReservedUSD = '0';
    },
    (v) => {
      v.prior.realRequestsTotal = 23;
    },
    (v) => {
      v.result.before = { state: 'different' };
    },
  ];
  for (const mutate of mutations) {
    const v = fixture();
    try {
      mutate(v);
      v.save();
      assert.throws(() => readFreeProbeLedger([v.reference]));
    } finally {
      rmSync(v.root, { recursive: true, force: true });
    }
  }
  const v = fixture();
  try {
    assert.throws(() => readFreeProbeLedger([{ ...v.reference, resultSHA256: 'a'.repeat(64) }]));
    assert.throws(() => readFreeProbeLedger([v.reference, v.reference]));
    assert.throws(() => readFreeProbeLedger([v.reference], new Set([v.result.requestId])));
    const read = readFreeProbeLedger([v.reference]);
    writeFileSync(join(v.probe, 'sealed-request.json'), '{}');
    assert.throws(() => readFreeProbeLedger(read.sourceProof));
  } finally {
    rmSync(v.root, { recursive: true, force: true });
  }
});
