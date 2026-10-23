/* 由维护入口调用；只对已登记自有账户追加快照，不启动 Nest 或后台消费者。 */
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
const runtimeRequire = createRequire('/app/apps/server/package.json');
runtimeRequire('reflect-metadata');
const { PrismaClient } = runtimeRequire('@prisma/client');
const load = (name) => runtimeRequire(`/app/apps/server/dist/src/${name}.js`);
const { PerformanceSnapshotService } = load('performance/performance-snapshot.service');
const { PerformanceDataService } = load('performance/performance-data.service');
const { frozenSnapshotInputs } = load('performance/performance-snapshot-inputs');
const { MarketBarReader } = load('market/market-bar-reader');
const { MarketBarWindowReaderV3 } = load('market/market-bar-reader-v3');
const { MarketWindowEvidenceV3Repository } = load('market/market-window-evidence-v3.repository');
const { DsaClient } = load('integration/dsa/dsa.client');

async function main() {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  assert(
    ['risk', 'estimate', 'calibrate', 'point-preflight', 'point-sample'].includes(input.phase),
  );
  assert.match(input.accountId, /^[0-9a-f-]{36}$/);
  assert.match(input.accountName, /^风险与正式校准验收-\d{8}-[0-9a-f]{8}$/);
  assert.match(input.valuationDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(process.env.AI_RESEARCH_EXECUTION_ENABLED, 'false');
  const prisma = new PrismaClient();
  try {
    const identity =
      await prisma.$queryRaw`SELECT current_database() AS database, current_user AS owner`;
    assert.equal(identity[0].database, input.database);
    assert.equal(identity[0].owner, decodeURIComponent(new URL(process.env.DATABASE_URL).username));
    const account = await prisma.account.findUniqueOrThrow({ where: { id: input.accountId } });
    assert.equal(account.name, input.accountName);
    assert.equal(account.type, 'securities');
    assert.equal(account.mode, 'actual');
    assert.equal(account.currency, 'CNY');
    const api = async (path) => {
      const response = await fetch(`http://127.0.0.1:3000${path}`, {
        signal: AbortSignal.timeout(60000),
      });
      assert.equal(response.status, 200, `只读 API ${path.split('?')[0]} 不可用`);
      return response.json();
    };
    const quoteObservations = [];
    const market = {
      getQuote: async (symbol, options = {}) => {
        assert.equal(symbol, '600000.SH');
        const quote = await api('/api/market/600000.SH/quote?assetType=STOCK');
        if (options.allowStale === false) assert.equal(quote.stale, false, '拒绝陈旧行情');
        quoteObservations.push(quote);
        return quote;
      },
    };
    const observations = [];
    const windows = new MarketBarWindowReaderV3(
      { getPolicy: () => api('/api/market-data/policy') },
      new DsaClient(),
      new MarketWindowEvidenceV3Repository(prisma),
    );
    const actualReader = new MarketBarReader(windows);
    const bars = {
      readV3: async (request) => {
        assert.equal(request.symbol, '600000.SH');
        assert.equal(request.window.end, input.valuationDate);
        assert(['2026-10-15', input.valuationDate].includes(request.window.start));
        const result = await actualReader.readV3(request);
        observations.push({
          request,
          status: result.status,
          ...(result.status === 'selected'
            ? {
                seriesVersion: result.seriesVersion,
                provenance: result.selection.response.provenance,
                bars: result.selection.response.bars,
                coverage: result.selection.response.coverage,
              }
            : { selection: result.selection }),
        });
        return result;
      },
    };
    const data = new PerformanceDataService(prisma, market);
    const snapshots = new PerformanceSnapshotService(prisma, market, data, bars);
    if (input.phase.startsWith('point-')) {
      assert.equal(account.id, '8cbb048e-9c15-480d-be49-6865679d76c7');
      assert.equal(account.name, '风险与正式校准验收-20261017-0b3235a5');
      const otherHash = async () =>
        createHash('sha256')
          .update(
            JSON.stringify(
              await prisma.accountValuationPoint.findMany({
                where: { accountId: { not: account.id } },
                orderBy: { id: 'asc' },
              }),
              (_, value) => (typeof value === 'bigint' ? value.toString() : value),
            ),
          )
          .digest('hex');
      const nonOwnedPointsHash = await otherHash();
      if (input.phase === 'point-preflight') {
        const { projectCashBalances } = load('ledger/cash-projection');
        const ledger = await prisma.ledgerEvent.findMany({ where: { accountId: account.id } });
        const cash = projectCashBalances(ledger).get(account.id) ?? new Map();
        console.log(
          JSON.stringify({
            account,
            nonOwnedPointsHash,
            positions: await prisma.position.findMany({ where: { accountId: account.id } }),
            cash: Object.fromEntries(
              [...cash].map(([currency, value]) => [currency, value.toString()]),
            ),
            ownPointCount: await prisma.accountValuationPoint.count({
              where: { accountId: account.id },
            }),
          }),
        );
      } else {
        assert.equal(account.active, true);
        assert.match(input.nonOwnedPointsHash, /^[0-9a-f]{64}$/);
        assert.equal(nonOwnedPointsHash, input.nonOwnedPointsHash);
        const { PerformanceLayerService } = load('performance/performance-layer.service');
        const { PerformanceValuationSeriesService } = load(
          'performance/performance-valuation-series.service',
        );
        const series = new PerformanceValuationSeriesService(
          prisma,
          new PerformanceLayerService(prisma, market, data),
          snapshots,
          market,
          bars,
        );
        const result = await series.sample(new Date(), 'actual', 'CNY', { accountId: account.id });
        assert.equal(result.sampled, 1);
        const point = await prisma.accountValuationPoint.findUniqueOrThrow({
          where: {
            accountId_mode_at_baseCurrency: {
              accountId: account.id,
              mode: 'actual',
              at: new Date(result.at),
              baseCurrency: 'CNY',
            },
          },
        });
        assert.equal(Number(point.cashValue), 9000);
        assert.equal(Number(point.marketValue), 100 * quoteObservations.at(-1).price);
        assert.equal(Number(point.pricedCoverage), 1);
        assert.equal(point.dataQuality, 'COMPLETE');
        assert.equal(await otherHash(), nonOwnedPointsHash);
        console.log(JSON.stringify({ result, point, quoteObservations, nonOwnedPointsHash,
          points: await prisma.accountValuationPoint.findMany({
            where: { accountId: account.id }, orderBy: { at: 'asc' },
          }),
        }, (_, value) => typeof value === 'bigint' ? value.toString() : value));
      }
    } else if (input.phase === 'risk') {
      const { StrategyRiskContextService } = load('risk/strategy-risk-context.service');
      const context = await new StrategyRiskContextService(prisma, bars, market).load(
        input.accountId,
        '600000.SH',
        {
          executionInstrument: { symbol: '600000.SH', assetType: 'stock', market: 'CN' },
          primaryTimeframe: '1d',
          requiresHoldingPeriods: true,
        },
      );
      console.log(JSON.stringify({ context, observations }));
    } else if (input.phase === 'estimate') {
      assert.equal(account.active, true);
      assert.equal(
        await prisma.portfolioSnapshot.count({ where: { accountId: input.accountId } }),
        0,
      );
      const estimate = await snapshots.capture(
        input.accountId,
        new Date(`${input.valuationDate}T08:00:00Z`),
        'actual',
        {},
        {
          source: 'DAILY_CLOSE',
          sourceRef: `acceptance:${input.accountId}`,
          valuationDate: new Date(input.valuationDate),
        },
      );
      assert.equal(Number(estimate.cashValue), 9000);
      assert.equal(Number(estimate.costValue), 1000);
      console.log(JSON.stringify({ phase: input.phase, identity, estimate }));
    } else {
      assert.equal(account.active, false);
      const estimate = await prisma.portfolioSnapshot.findUniqueOrThrow({
        where: { id: input.estimateId },
      });
      assert.equal(estimate.accountId, input.accountId);
      assert.equal(estimate.sourceRef, `acceptance:${input.accountId}`);
      assert.equal(estimate.valuationBasis, 'ESTIMATED');
      const before = JSON.stringify(estimate);
      const current = await prisma.position.findMany({ where: { accountId: input.accountId } });
      assert(current.every((row) => Number(row.quantity) === 0));
      const result = await snapshots.reconcileOfficial(100, input.accountId);
      assert.equal(result.scanned, 1);
      assert.deepEqual(result.pending, []);
      assert.equal(result.reconciled.length, 1);
      const official = await prisma.portfolioSnapshot.findUniqueOrThrow({
        where: { id: result.reconciled[0] },
      });
      assert.equal(official.accountId, input.accountId);
      assert.equal(official.revision, 2);
      assert.equal(official.supersedesSnapshotId, estimate.id);
      assert.equal(Number(official.cashValue), 9000);
      assert.equal(Number(official.costValue), 1000);
      assert.equal(official.valuationStatus, 'COMPLETE');
      const repeated = await snapshots.capture(
        input.accountId,
        estimate.capturedAt,
        'actual',
        {},
        {
          source: 'DAILY_CLOSE',
          valuationBasis: 'OFFICIAL',
          valuationDate: estimate.valuationDate,
        },
        frozenSnapshotInputs(estimate),
      );
      assert.equal(repeated.id, official.id);
      assert.equal(
        await prisma.portfolioSnapshot.count({ where: { accountId: input.accountId } }),
        2,
      );
      assert.equal(
        JSON.stringify(
          await prisma.portfolioSnapshot.findUniqueOrThrow({ where: { id: estimate.id } }),
        ),
        before,
      );
      console.log(
        JSON.stringify({
          phase: input.phase,
          identity,
          official,
          observations,
          originalSnapshotUnchanged: true,
          repeatedOfficialId: repeated.id,
          revisions: (await snapshots.detail(estimate.id)).revisions.map((row) => ({
            id: row.id,
            revision: row.revision,
          })),
        }),
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
