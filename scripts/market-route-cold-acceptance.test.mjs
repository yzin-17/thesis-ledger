import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyColdPrimary } from './market-route-cold-acceptance.mjs';

function fixture() {
  const plan = {
    policyRevision: 164,
    sourceHashes: { runtime: 'same' },
    request: { requestId: 'case' },
  };
  const result = {
    status: 200,
    wholeProcessMs: 1200,
    processRuntimeMs: 1100,
    requestMs: 400,
    runtimeInitiallyAbsent: true,
    lifespanStarted: false,
    modelModulesLoaded: [],
    sourceHashes: { runtime: 'same' },
    body: {
      contractVersion: 3,
      purpose: 'interactive-chart',
      symbol: '510300.SH',
      requestId: 'case',
      routeKey: {
        kind: 'bar',
        market: 'CN',
        assetType: 'ETF',
        capability: 'DAILY_BAR',
        timeframe: '1d',
        adjustment: 'qfq',
      },
      provenance: {
        providerId: 'hithink',
        upstreamSource: 'fund-market-historical',
        routeIndex: 0,
        effectivePolicyRevision: 164,
      },
      bars: ['15', '16', '17', '18', '19'].map((day) => ({
        timestamp: `2024-07-${day}T00:00:00Z`,
        completionStatus: 'complete',
        close: 3,
      })),
      inputFingerprint: 'a'.repeat(64),
      sourcePriceBasis: { adjustment: 'qfq' },
    },
  };
  return { plan, result };
}
test('使用整个进程窗口、正式路由来源、五个完整交易日与当前产物', () => {
  const { plan, result } = fixture();
  verifyColdPrimary(plan, result);
});
for (const [name, mutate] of [
  [
    '仅请求快但启动慢',
    (row) => {
      row.wholeProcessMs = 5001;
    },
  ],
  [
    '预热 Runtime',
    (row) => {
      row.runtimeInitiallyAbsent = false;
    },
  ],
  [
    '后台生命周期',
    (row) => {
      row.lifespanStarted = true;
    },
  ],
  [
    '模型导入',
    (row) => {
      row.modelModulesLoaded = ['openai'];
    },
  ],
  [
    '旧产物',
    (row) => {
      row.sourceHashes.runtime = 'different';
    },
  ],
  [
    '替换来源',
    (row) => {
      row.body.provenance.providerId = 'tencent';
    },
  ],
  [
    '旧政策',
    (row) => {
      row.body.provenance.effectivePolicyRevision = 163;
    },
  ],
  [
    '缺交易日',
    (row) => {
      row.body.bars.pop();
    },
  ],
  [
    '失败响应',
    (row) => {
      row.status = 503;
    },
  ],
])
  test(`拒绝${name}`, () => {
    const { plan, result } = fixture();
    mutate(result);
    assert.throws(() => verifyColdPrimary(plan, result));
  });
