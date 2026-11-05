import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  createDisclosurePlan,
  assertDisclosurePlan,
  assertDisclosureAccount,
  assertDisclosureLedger,
  assertDisclosureBarsRepair,
  assertDisclosureSampleRecovery,
  assertQualifiedDisclosureSource,
  restoreDisclosurePolicy,
  disclosureChannel,
} from './fund-disclosure-acceptance-guards.mjs';
import {
  disclosureArguments,
  disclosurePrivatePath,
  disclosurePointsSql,
} from './fund-disclosure-acceptance.mjs';

const requestId = '11111111-1111-4111-8111-111111111111';
const state = {
  contractVersion: 3,
  consumer: 'thesis-ledger',
  requestId,
  revision: 158,
  enabled: true,
  routes: [],
  syncState: 'applied',
  effectiveStale: false,
  dsaRevision: 158,
};
const providers = ['efinance', 'akshare'].map((providerId) => ({
  providerId,
  enabled: true,
  configured: true,
  configVersion: 0,
}));
const catalog = {
  status: 'complete',
  entries: ['FUND_NAV', 'FUND_HOLDINGS'].map((capability) => ({
    key: { kind: 'data', market: 'CN', assetType: 'MUTUAL_FUND', capability },
    target: {
      providerId: capability === 'FUND_HOLDINGS' ? 'akshare' : 'efinance',
      upstreamSource: 'eastmoney',
    },
    state: 'ready',
  })),
};
const baseline = { identity: { asset: { identityStatus: 'confirmed' } } };
const plan = () => createDisclosurePlan(state, providers, catalog, baseline);

test('缺少显式执行参数时始终只读，拒绝不带授权的执行', () => {
  assert.deepEqual(disclosureArguments([]), { mode: 'plan' });
  assert.throws(() => disclosureArguments(['--execute', 'x']));
  assert.equal(
    disclosureArguments(['--execute', 'x', '--authorized-fund-disclosure']).mode,
    'execute',
  );
});
test('实际运行回执序列化保留 BigInt 点位 ID，不损坏数值或时刻', () => {
  const { serializeDisclosureEvidence } = createRequire(import.meta.url)(
    './fund-disclosure-acceptance-runtime.cjs',
  );
  const point = { id: 3n, totalValue: '929.06', at: new Date('2026-10-20T18:20:00Z') };
  assert.deepEqual(JSON.parse(serializeDisclosureEvidence({ points: [point] })), {
    points: [{ id: '3', totalValue: '929.06', at: '2026-10-20T18:20:00.000Z' }],
  });
  assert.equal(point.id, 3n);
});
test('采样恢复只允许已结清自有账户及唯一实际首点，不重采首点', () => {
  const p = plan(),
    events = ['deposit', 'buy', 'sell', 'withdraw'].map((key) => ({
      actorId: p.caseId,
      sourceChannel: disclosureChannel,
      externalId: `${p.caseId}:${key}`,
    }));
  const record = {
    plan: p,
    phase: 'recovery-required',
    failure: '目标 sample 缺少有限回执',
    settled: true,
    protection: { passed: true },
    account: { id: requestId },
    source: { holdings: { evidenceVersion: 'original' } },
    prices: { capturedAt: new Date().toISOString() },
  };
  const state = {
    owned: { account: { id: requestId, active: false }, quantity: 0, cashValue: 0, events },
    points: [
      { id: '3', dataQuality: 'COMPLETE', evidence: { funds: [{ evidenceVersion: 'original' }] } },
    ],
  };
  assertDisclosureSampleRecovery(record, state);
  assert.throws(() =>
    assertDisclosureSampleRecovery({ ...record, sampleRepairStarted: true }, state),
  );
  assert.throws(() => assertDisclosureSampleRecovery(record, { ...state, points: [] }));
  assert.throws(() =>
    assertDisclosureSampleRecovery(record, {
      ...state,
      points: [...state.points, ...state.points],
    }),
  );
});
const qualifiedSource = () => {
  const at = '2026-10-20T17:46:00.000Z',
    digest = 'a'.repeat(64);
  const nav = {
    version: 3,
    symbol: '161725.OF',
    unitNav: 0.5406,
    navDate: '2026-10-20T00:00:00Z',
    provider: 'efinance',
    fetchedAt: at,
    freshness: 'delayed',
    fallbackUsed: false,
  };
  const holdings = {
    version: 3,
    fundSymbol: '161725.OF',
    reportPeriod: '2026-Q2',
    disclosureDate: null,
    provider: 'akshare',
    fetchedAt: at,
    evidenceVersion: digest,
    fallbackUsed: false,
    holdings: [{ symbol: '600519.SH', name: '实际披露', weight: 0.1499 }],
    disclosureEvidence: {
      status: 'matched',
      fundSymbol: '161725.OF',
      reportPeriod: '2026-Q2',
      referenceVersion: 'b'.repeat(64),
      issuer: '管理人',
      precision: 'DATE_ONLY',
      publishedOn: '2026-08-31',
      timezone: 'Asia/Shanghai',
      referenceObservedAt: '2026-10-20T17:22:53.805Z',
      availableAt: '2026-10-20T17:22:53.805Z',
      holdingsDigest: digest,
      matchedCount: 1,
      referenceCount: 74,
      algorithm: 'exact_symbol_weight_v1',
      sources: [
        { role: 'report', url: 'https://example.com/report.pdf', sha256: 'c'.repeat(64) },
        { role: 'publication_notice', url: 'https://example.com/notice', sha256: 'd'.repeat(64) },
      ],
    },
  };
  return {
    phase: 'passed',
    plan: { symbol: '161725.OF' },
    protection: { passed: true },
    web: { minuteSeriesObserved: true },
    source: {
      capturedAt: at,
      nav: { ...nav, servedFromCache: false },
      holdings: { ...holdings, servedFromCache: false },
      observations: [
        {
          path: '/api/v3/thesis-ledger/market/fund-nav?symbol=161725.OF',
          raw: structuredClone(nav),
        },
        {
          path: '/api/v3/thesis-ledger/market/fund-holdings?symbol=161725.OF',
          raw: structuredClone(holdings),
        },
      ],
    },
  };
};
test('复用只接受已通过且标准结果与原响应相同的有限来源观察', () => {
  const record = qualifiedSource(),
    now = Date.parse('2026-10-20T18:40:00Z');
  assertQualifiedDisclosureSource(record, now);
  assert.throws(() =>
    assertQualifiedDisclosureSource({ ...record, phase: 'recovery-required' }, now),
  );
  assert.throws(() => assertQualifiedDisclosureSource(record, now + 25 * 60 * 60_000));
  const changed = structuredClone(record);
  changed.source.holdings.holdings[0].weight = 0.2;
  assert.throws(() => assertQualifiedDisclosureSource(changed, now));
});
test('复用的基金源原响应未知、备用或缓存不能冒充合格来源', () => {
  const now = Date.parse('2026-10-20T18:40:00Z');
  const cached = qualifiedSource();
  cached.source.nav.servedFromCache = true;
  assert.throws(() => assertQualifiedDisclosureSource(cached, now));
  const missing = qualifiedSource();
  missing.source.observations.pop();
  assert.throws(() => assertQualifiedDisclosureSource(missing, now));
});
test('复用来源的维护案例没有路由回写所有权', async () => {
  const p = plan();
  p.adjustedPriceCase = true;
  p.sourceReuse = { path: 'private-receipt', sha256: 'a'.repeat(64) };
  let writes = 0;
  await assert.rejects(
    restoreDisclosurePolicy(async (method) => {
      if (method === 'PUT') writes++;
      return {
        ...p.temporary,
        syncState: 'applied',
        effectiveStale: false,
        dsaRevision: p.temporary.revision,
      };
    }, p),
  );
  assert.equal(writes, 0);
  assert.equal(
    disclosureArguments(['--plan-file', 'new', '--reuse-qualified-source', 'old']).source,
    'old',
  );
});
test('精确临时来源只有基金 NAV 与持仓，原路由不改', () => {
  const p = plan();
  assertDisclosurePlan(p);
  assert.equal(p.temporary.revision, 159);
  assert.deepEqual(
    p.temporary.routes.map((r) => r.key.capability),
    ['FUND_NAV', 'FUND_HOLDINGS'],
  );
});
test('已有来源路由禁止接管', () => {
  assert.throws(() =>
    createDisclosurePlan(
      { ...state, routes: [catalog.entries[0]].map((e) => ({ key: e.key, targets: [e.target] })) },
      providers,
      catalog,
      baseline,
    ),
  );
});
test('来源停用、目录不完整或应用未同步均禁止开始', () => {
  assert.throws(() =>
    createDisclosurePlan(state, [{ ...providers[0], enabled: false }], catalog, baseline),
  );
  assert.throws(() =>
    createDisclosurePlan(state, providers, { ...catalog, status: 'partial' }, baseline),
  );
  assert.throws(() =>
    createDisclosurePlan({ ...state, dsaRevision: 157 }, providers, catalog, baseline),
  );
});
test('未确认资产不会自动确认或绕过普通 Ledger', () => {
  assert.throws(() =>
    createDisclosurePlan(state, providers, catalog, {
      identity: { asset: { identityStatus: 'provider' } },
    }),
  );
});
test('篡改临时来源、证券或新增第三条路线均拒绝', () => {
  const p = plan();
  p.temporary.routes[0].targets[0].providerId = 'akshare';
  assert.throws(() => assertDisclosurePlan(p));
  const another = plan();
  another.symbol = '000001.OF';
  assert.throws(() => assertDisclosurePlan(another));
  const extra = plan();
  extra.temporary.routes.push(extra.temporary.routes[0]);
  assert.throws(() => assertDisclosurePlan(extra));
});
test('账户只能是本案精确命名的实际基金账户', () => {
  const p = plan(),
    account = { id: requestId, name: p.accountName, mode: 'actual', type: 'fund', currency: 'CNY' };
  assertDisclosureAccount(account, p);
  assert.throws(() => assertDisclosureAccount({ ...account, name: '旧账户' }, p));
  assert.throws(() => assertDisclosureAccount({ ...account, mode: 'shadow' }, p));
});
test('未知或重复审计阻止恢复清理', () => {
  const p = plan(),
    event = {
      actorId: p.caseId,
      sourceChannel: disclosureChannel,
      externalId: `${p.caseId}:deposit`,
    };
  assertDisclosureLedger([event], p);
  assert.throws(() => assertDisclosureLedger([event, event], p));
  assert.throws(() => assertDisclosureLedger([{ ...event, externalId: 'foreign' }], p));
  assert.throws(() => assertDisclosureLedger([{ ...event, actorId: requestId }], p));
});
test('恢复仅撤销自己仍持有的精确临时修订', async () => {
  const p = plan();
  let current = { ...p.temporary, syncState: 'applied', dsaRevision: 159, effectiveStale: false };
  let writes = 0;
  const api = async (method, path, body) => {
    assert.equal(path, '/api/market-data/policy');
    if (method === 'PUT') {
      writes++;
      assert.equal(body.expectedRevision, 159);
      current = {
        ...body,
        syncState: 'applied',
        dsaRevision: body.revision,
        effectiveStale: false,
      };
    }
    return current;
  };
  assert.deepEqual(await restoreDisclosurePolicy(api, p), {
    revision: 160,
    routes: 0,
    originalRouteChoicesRestored: true,
  });
  await restoreDisclosurePolicy(api, p);
  assert.equal(writes, 1);
});
test('政策并行修改不被恢复覆盖', async () => {
  const p = plan();
  let writes = 0;
  const current = { ...p.temporary, revision: 160 };
  await assert.rejects(
    restoreDisclosurePolicy(async (method) => {
      if (method !== 'GET') writes++;
      return current;
    }, p),
  );
  assert.equal(writes, 0);
});
test('点位保护只允许精确 UUID 排除，不接受 SQL 或路径越界', () => {
  assert(disclosurePointsSql(requestId).includes(`'${requestId}'::uuid`));
  assert.throws(() => disclosurePointsSql("x' OR true"));
  assert.throws(() => disclosurePrivatePath('/tmp/fund-plan.json'));
});
test('日期修复只接受已在 Server 拒绝且尚未创建账户的原回执', () => {
  const now = Date.now();
  const record = {
    phase: 'recovery-required',
    failure: '真实底层价格覆盖不足，保留来源结果，不创建账户',
    source: {
      holdings: {
        disclosureEvidence: { status: 'matched' },
        holdings: [{ symbol: '600519.SH', weight: 0.1 }],
      },
    },
    prices: {
      capturedAt: new Date(now - 1000).toISOString(),
      prices: {
        '600519.SH': {
          httpStatus: 400,
          raw: { message: 'start 必须是 YYYY-MM-DD 日期' },
          quote: { price: 100 },
        },
      },
    },
  };
  assertDisclosureBarsRepair(record, now);
  assert.throws(() => assertDisclosureBarsRepair({ ...record, account: { id: requestId } }, now));
  assert.throws(() => assertDisclosureBarsRepair({ ...record, barsRepairStarted: true }, now));
  assert.throws(() => assertDisclosureBarsRepair(record, now + 16 * 60_000));
  const valid = structuredClone(record);
  valid.prices.prices['600519.SH'].httpStatus = 200;
  assert.throws(() => assertDisclosureBarsRepair(valid, now));
});
