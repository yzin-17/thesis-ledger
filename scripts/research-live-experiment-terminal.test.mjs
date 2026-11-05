import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { setup } from './research-live-experiment-source-fixture.mjs';
import {
  readTerminalExperiment,
  collectRetainedStageOutputs,
} from './research-live-experiment-terminal.mjs';
import { readFreeProbeLedger } from './research-live-experiment-supplemental.mjs';

test('多段失败组只提取原审计中的前序输出，缺失或指纹漂移拒绝', () => {
  const fingerprint = (value) => JSON.stringify(value);
  const output = { version: 2, value: '受控输出' };
  const requests = ['first', 'second', 'failed'].map((requestId) => ({
    requestId,
    facts: [{ outputFingerprint: fingerprint(output) }],
  }));
  const arms = [{ result: { status: 'failed', requests } }];
  const journals = new Map(requests.map((request) => [request.requestId, { output }]));
  assert.deepEqual(
    collectRetainedStageOutputs(arms, journals, fingerprint).map((v) => v.requestId),
    ['first', 'second'],
  );
  journals.delete('second');
  assert.throws(() => collectRetainedStageOutputs(arms, journals, fingerprint));
  journals.set('second', { output: { ...output, value: '漂移' } });
  assert.throws(() => collectRetainedStageOutputs(arms, journals, fingerprint));
});
import { readExperimentHistory } from './research-live-experiment-checkpoint.mjs';
import { parseLiveExperimentArgs } from './research-live-experiment-args.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const write = (dir, name, value) => writeFileSync(join(dir, name), JSON.stringify(value));

function fixture() {
  const v = setup();
  const probe = join(v.root, 'probe');
  mkdirSync(probe);
  const body = {
    model: 'openrouter/free',
    messages: [{ role: 'user', content: 'OK' }],
    max_tokens: 64,
  };
  const probeResult = {
    requestId: '00000000-0000-4000-8000-000000000099',
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
    initialCumulativeRequests: 3,
    realRequestsTotal: 4,
    before: v.inputs.target,
    after: v.inputs.target,
    budget: { occupiedUSD: '0.1642', unknownReservedUSD: '0.0642' },
  };
  write(probe, 'sealed-request.json', {
    body,
    bodySHA256: hash(JSON.stringify(body)),
    catalog: { pricing: { prompt: '0', completion: '0' } },
    authorization: {
      thisProbeMaxRequests: 1,
      cumulativeMaxRequests: 50,
      cumulativeMaxCostUSD: '5',
    },
    initialBudget: {
      artifactRoot: v.source,
      realRequestsTotal: 3,
      conservativeOccupiedUSD: '0.1642',
      conservativeUnknownReservedUSD: '0.0642',
    },
  });
  write(probe, 'result.json', probeResult);
  v.inputs.supplementalReferences = [
    { directory: probe, resultSHA256: hash(readFileSync(join(probe, 'result.json'))) },
  ];
  return { ...v, probe };
}

function resumed(v) {
  const original = readTerminalExperiment(v.source, v.protocol, v.fingerprint, v.inputs);
  const supplemental = readFreeProbeLedger(v.inputs.supplementalReferences);
  const child = join(v.root, 'child');
  mkdirSync(child);
  const request = {
    requestId: 'new-2',
    facts: [{ cost: { status: 'estimated', amount: '0', currency: 'USD' } }],
  };
  const staged = { status: 'failed', reason: 'schema_invalid', requests: [request] };
  const report = {
    ...v.result.report,
    cases: [{ ...v.result.report.cases[0], staged }],
    actualModelRequests: 2,
    reusedRequests: 1,
    supplementalBudget: supplemental.budget,
    budget: {
      stopped: 'continuation_arm_failed',
      requests: 5,
      spent: '0.1',
      committed: '0.1642',
      reservedUnknown: '0.0642',
    },
  };
  const result = {
    ...v.result,
    wireRequests: 1,
    realRequestsTotal: 5,
    report,
    resumedFrom: original.sourceProof,
    supplementalBudgetFrom: supplemental.sourceProof,
  };
  write(child, 'result.json', result);
  write(child, 'sealed-inputs.json', {
    ...v.sealed,
    initialBudget: { requests: 4, amount: '0.1642', reservedUnknown: '0.0642' },
  });
  write(child, 'arms.json', [
    { caseId: 'first', arm: 'single', result: v.result.report.cases[0].single },
    { caseId: 'first', arm: 'staged', result: staged },
  ]);
  write(child, 'request-journal.json', [
    { caseId: 'first', arm: 'staged', phase: 'settled', request, output: null },
  ]);
  write(child, 'http-status.json', [{ requestId: 'new-2', status: 200 }]);
  return child;
}

test('多组终态合并补充测试，跨协议历史再读取仍精确计一次', () => {
  const v = fixture();
  try {
    const value = readTerminalExperiment(v.source, v.protocol, v.fingerprint, v.inputs);
    assert.equal(value.priorRequests, 4);
    assert.equal(value.retainedArms.length, 1);
    assert.equal(value.continuation.sourceRequests, 3);
    assert.equal(value.continuation.sourceSupplementalRequests, 0);
    const child = resumed(v);
    const continued = readTerminalExperiment(child, v.protocol, v.fingerprint, v.inputs);
    assert.equal(continued.priorRequests, 5);
    assert.equal(continued.retainedArms.length, 2);
    assert.equal(continued.continuation.supplementalBudget.entries.length, 1);
    const history = readExperimentHistory(
      child,
      { ...v.protocol, model: { providerId: 'openrouter', id: 'different-model' } },
      v.fingerprint,
    );
    assert.equal(history.history.requests, 5);
    assert.equal(history.history.reservedUnknown, '0.0642');
    assert.equal(history.supplementalRequestIds.length, 1);
    assert.equal(history.requestIds.length, 5);
  } finally {
    rmSync(v.root, { recursive: true, force: true });
  }
});

test('审计、HTTP、预算、来源摘要或活动进程漂移均拒绝', () => {
  const mutations = [
    (v) => {
      v.result.pid = process.pid;
      v.save();
    },
    (v) => {
      v.result.realRequestsTotal = 2;
      v.save();
    },
    (v) => {
      v.journal[0].arm = 'staged';
      v.save();
    },
    (v) => {
      v.http[0].status = 200;
      v.save();
    },
    (v) => {
      v.result.report.cases[0].caseId = 'another';
      v.save();
    },
    (v) => {
      v.result.report.budget.spent = '0';
      v.save();
    },
    (v) => {
      v.sealed.initialBudget.requests = 1;
      v.save();
    },
    (v) => {
      v.inputs.supplementalReferences[0].resultSHA256 = 'a'.repeat(64);
    },
  ];
  for (const mutate of mutations) {
    const v = fixture();
    try {
      mutate(v);
      assert.throws(() => readTerminalExperiment(v.source, v.protocol, v.fingerprint, v.inputs));
    } finally {
      rmSync(v.root, { recursive: true, force: true });
    }
  }
  const v = fixture();
  try {
    const child = resumed(v);
    v.result.report.reusedRequests = 1;
    v.save();
    assert.throws(() => readTerminalExperiment(child, v.protocol, v.fingerprint, v.inputs));
  } finally {
    rmSync(v.root, { recursive: true, force: true });
  }
});

test('多组接续入口与其他来源互斥', () => {
  const base = [
    '--provider=openrouter',
    '--output=.recovery-artifacts/example',
    '--continue-terminal=source',
  ];
  assert.equal(parseLiveExperimentArgs(base).terminalArgument, '--continue-terminal=source');
  assert.throws(() => parseLiveExperimentArgs([...base, '--continue=other']));
  assert.throws(() => parseLiveExperimentArgs([...base, '--history=other']));
});
