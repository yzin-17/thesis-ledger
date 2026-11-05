import assert from 'node:assert/strict';
import test from 'node:test';
import { rmSync } from 'node:fs';
import { readRateLimitContinuation } from './research-live-experiment-continuation.mjs';
import { parseLiveExperimentArgs } from './research-live-experiment-args.mjs';
import { setup } from './research-live-experiment-source-fixture.mjs';

test('完整终态接续只保留已派发失败，继承原预算来源与不可变摘要', () => {
  const v = setup();
  try {
    const value = readRateLimitContinuation(v.source, v.protocol, v.fingerprint, v.inputs);
    assert.equal(value.priorRequests, 3);
    assert.equal(value.retainedArms.length, 1);
    assert.equal(value.continuation.historicalBudget.requests, 2);
    assert.equal(value.continuation.historicalBudget.reservedUnknown, '0.0642');
    assert.equal(Object.keys(value.sourceProof.hashes).length, 5);
  } finally {
    rmSync(v.root, { recursive: true, force: true });
  }
});

test('活动进程、封存/HTTP/审计/目标/预算被修改均在派发前拒绝', () => {
  const mutations = [
    (v) => {
      v.result.pid = process.pid;
    },
    (v) => {
      v.result.realRequestsTotal = 2;
    },
    (v) => {
      v.result.report.budget.spent = '0';
    },
    (v) => {
      v.http[0].status = 200;
    },
    (v) => {
      v.journal[0].phase = 'received';
    },
    (v) => {
      v.sealed.benchmarkSha256 = '0'.repeat(64);
    },
    (v) => {
      v.result.after = { protected: false };
    },
    (v) => {
      v.result.resumedFrom = {};
    },
  ];
  for (const mutate of mutations) {
    const v = setup();
    try {
      mutate(v);
      v.save();
      assert.throws(() => readRateLimitContinuation(v.source, v.protocol, v.fingerprint, v.inputs));
    } finally {
      rmSync(v.root, { recursive: true, force: true });
    }
  }
});

test('入口只选一种预算/接续来源，OpenRouter不能遗漏累计账本', () => {
  const base = ['--provider=openrouter', '--output=.recovery-artifacts/test'];
  assert.throws(() => parseLiveExperimentArgs(base));
  assert.throws(() => parseLiveExperimentArgs([...base, '--continue=a', '--history=b']));
  assert.throws(() => parseLiveExperimentArgs([...base, '--continue=a', '--resume=b']));
  assert.equal(
    parseLiveExperimentArgs([...base, '--continue=a']).continuationArgument,
    '--continue=a',
  );
});

test('Cloudflare49次首429续接保留付费未知预留，只恢复未派发组', () => {
  const v = setup(true);
  try {
    const value = readRateLimitContinuation(v.source, v.protocol, v.fingerprint, v.inputs);
    assert.equal(value.priorRequests, 49);
    assert.equal(value.retainedArms.length, 1);
    assert.equal(value.retainedArms[0].arm, 'single');
    assert.deepEqual(value.retainedArms[0].result, v.result.report.cases[0].single);
    assert.equal(value.continuation.historicalBudget.requests, 48);
    assert.equal(value.continuation.historicalBudget.reservedUnknown, '0.0642');
    assert.equal(v.result.report.budget.reservedUnknown, '0.1284');
    assert.equal(Object.keys(value.sourceProof.hashes).length, 5);
  } finally {
    rmSync(v.root, { recursive: true, force: true });
  }
});

test('Cloudflare续接丢失或双计未知预留、费用/子码/累计起点漂移均拒绝', () => {
  for (const change of [
    (v) => {
      v.result.report.budget.reservedUnknown = '0.0642';
    },
    (v) => {
      v.result.report.budget.reservedUnknown = '0.1926';
    },
    (v) => {
      v.result.report.budget.committed = '0.1642';
    },
    (v) => {
      v.result.report.budget.spent = '0';
    },
    (v) => {
      v.http[0].errorCodes = [3036];
    },
    (v) => {
      v.result.realRequestsTotal = 50;
    },
  ]) {
    const v = setup(true);
    try {
      change(v);
      v.save();
      assert.throws(() => readRateLimitContinuation(v.source, v.protocol, v.fingerprint, v.inputs));
    } finally {
      rmSync(v.root, { recursive: true, force: true });
    }
  }
});
