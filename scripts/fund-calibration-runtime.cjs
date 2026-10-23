/* 只由基金维护入口调用；不启动 Nest、Scheduler 或模型，只操作登记的自有账户槽位。 */
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const runtimeRequire = createRequire('/app/apps/server/package.json');
runtimeRequire('reflect-metadata');
const { PrismaClient } = runtimeRequire('@prisma/client');
const load = (name) => runtimeRequire(`/app/apps/server/dist/src/${name}.js`);
const symbol = '161725.OF';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const evidence = { observations: [] };

async function main() {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  evidence.phase = input.phase;
  assert(['inspect', 'estimate', 'calibrate'].includes(input.phase));
  assert(uuid.test(input.caseId) && uuid.test(input.accountId));
  assert(
    new RegExp(`^基金正式校准验收-\\d{8}-${input.caseId.slice(0, 8)}$`).test(input.accountName),
  );
  assert.equal(input.database, 'thesis_ledger');
  const prisma = new PrismaClient();
  try {
    const identity =
      await prisma.$queryRaw`SELECT current_database() AS database, current_user AS owner`;
    assert.equal(identity[0].database, input.database);
    assert.equal(identity[0].owner, decodeURIComponent(new URL(process.env.DATABASE_URL).username));
    const account = await prisma.account.findUniqueOrThrow({ where: { id: input.accountId } });
    assert(
      account.name === input.accountName &&
        account.type === 'fund' &&
        account.mode === 'actual' &&
        account.currency === 'CNY',
      '基金账户所有权不符',
    );
    const events = await prisma.ledgerEvent.findMany({
      where: { accountId: account.id },
      orderBy: { ledgerRevision: 'asc' },
    });
    assert(events.length <= 4);
    const externalIds = new Set();
    for (const row of events) {
      assert(
        row.sourceChannel === 'fund-calibration-acceptance' &&
          row.actorId === input.caseId &&
          ['deposit', 'buy', 'sell', 'withdraw'].some(
            (key) => row.externalId === `${input.caseId}:${key}`,
          ) &&
          !externalIds.has(row.externalId),
        '范围外记账，停止操作',
      );
      externalIds.add(row.externalId);
    }
    const positions = await prisma.position.findMany({ where: { accountId: account.id } });
    assert(positions.every((p) => p.symbol === symbol));
    const { projectCashBalances } = load('ledger/cash-projection');
    const balances = projectCashBalances(events).get(account.id) ?? new Map();
    assert([...balances.keys()].every((c) => c === 'CNY'));
    const cashValue = Number(balances.get('CNY')?.toString() ?? '0');
    const quantity = positions.reduce((sum, p) => sum + Number(p.quantity), 0);
    const owned = {
      account,
      events: events.map((e) => ({
        id: e.id,
        sourceChannel: e.sourceChannel,
        actorId: e.actorId,
        externalId: e.externalId,
      })),
      quantity,
      cashValue,
    };
    if (input.phase === 'inspect') {
      console.log('FUND_CALIBRATION_RESULT=' + JSON.stringify(owned));
      return;
    }
    assert.match(input.valuationDate, /^\d{4}-\d{2}-\d{2}$/);
    const { fundNavSchema, fundNavHistorySchema } = runtimeRequire('@thesis-ledger/schemas');
    const observations = evidence.observations;
    const read = async (path) => {
      assert(observations.length < (input.phase === 'estimate' ? 1 : 2), '超过本阶段数据请求预算');
      const response = await fetch('http://127.0.0.1:3000' + path, {
        signal: AbortSignal.timeout(30000),
        headers: process.env.SERVER_API_TOKEN
          ? { authorization: `Bearer ${process.env.SERVER_API_TOKEN}` }
          : undefined,
      });
      assert.equal(response.status, 200, '限定基金接口未成功');
      const raw = await response.json();
      observations.push({ path, raw });
      return raw;
    };
    const check = (point) => {
      assert(
        point.symbol === symbol &&
          point.provider === 'efinance' &&
          point.freshness === 'delayed' &&
          point.unitNav > 0 &&
          point.fallbackUsed !== true &&
          point.navDate.slice(0, 10) === input.valuationDate,
      );
      return point;
    };
    const market = {
      getFundNav: async (requested) => {
        assert.equal(requested, symbol);
        return check(fundNavSchema.parse(await read(`/api/market/${symbol}/fund-nav`)));
      },
      getFundNavHistory: async (requested, range) => {
        assert.equal(requested, symbol);
        assert(range.start === input.valuationDate && range.end === input.valuationDate);
        const points = fundNavHistorySchema.parse(
          await read(
            `/api/market/${symbol}/fund-nav/history?start=${input.valuationDate}&end=${input.valuationDate}&limit=1`,
          ),
        );
        assert.equal(points.length, 1);
        points.forEach(check);
        return points;
      },
    };
    const { PerformanceDataService } = load('performance/performance-data.service');
    const { PerformanceSnapshotService } = load('performance/performance-snapshot.service');
    const { frozenSnapshotInputs } = load('performance/performance-snapshot-inputs');
    const data = new PerformanceDataService(prisma, market);
    const service = new PerformanceSnapshotService(prisma, market, data);
    if (input.phase === 'estimate') {
      assert(account.active && events.length === 2 && quantity === 100 && cashValue === 875);
      assert.equal(await prisma.portfolioSnapshot.count({ where: { accountId: account.id } }), 0);
      const estimate = await service.capture(
        account.id,
        new Date(),
        'actual',
        {},
        {
          source: 'DAILY_CLOSE',
          sourceRef: `owned-fund:${input.caseId}`,
          valuationDate: new Date(input.valuationDate + 'T00:00:00Z'),
        },
      );
      assert(estimate.valuationBasis === 'ESTIMATED' && estimate.valuationStatus === 'COMPLETE');
      assert.equal(Number(estimate.cashValue), 875);
      assert.equal(Number(estimate.costValue), 125);
      console.log('FUND_CALIBRATION_RESULT=' + JSON.stringify({ estimate, observations }));
      return;
    }
    assert(!account.active && quantity === 0 && cashValue === 0 && events.length === 4);
    assert(uuid.test(input.estimateId));
    const estimate = await prisma.portfolioSnapshot.findUniqueOrThrow({
      where: { id: input.estimateId },
    });
    assert(
      estimate.accountId === account.id &&
        estimate.sourceRef === `owned-fund:${input.caseId}` &&
        estimate.valuationBasis === 'ESTIMATED',
    );
    assert.equal(await prisma.portfolioSnapshot.count({ where: { accountId: account.id } }), 1);
    const original = JSON.stringify(estimate);
    const result = await service.reconcileOfficial(1, account.id);
    assert(result.scanned === 1 && result.pending.length === 0 && result.reconciled.length === 1);
    const official = await prisma.portfolioSnapshot.findUniqueOrThrow({
      where: { id: result.reconciled[0] },
    });
    assert(
      official.revision === 2 &&
        official.supersedesSnapshotId === estimate.id &&
        official.valuationBasis === 'OFFICIAL' &&
        official.valuationStatus === 'COMPLETE',
    );
    assert.equal(Number(official.cashValue), 875);
    assert.equal(Number(official.costValue), 125);
    const { Prisma } = runtimeRequire('@prisma/client');
    const expectedMarket = new Prisma.Decimal(observations[0].raw[0].unitNav).mul(100);
    assert(new Prisma.Decimal(official.marketValue).eq(expectedMarket));
    assert(new Prisma.Decimal(official.totalValue).eq(expectedMarket.plus(875)));
    const repeated = await service.capture(
      account.id,
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
    assert.equal(await prisma.portfolioSnapshot.count({ where: { accountId: account.id } }), 2);
    assert.equal(
      JSON.stringify(
        await prisma.portfolioSnapshot.findUniqueOrThrow({ where: { id: estimate.id } }),
      ),
      original,
    );
    const error = Number(official.totalValue) - Number(estimate.totalValue);
    console.log(
      'FUND_CALIBRATION_RESULT=' +
        JSON.stringify({
          official,
          repeatedOfficialId: repeated.id,
          originalSnapshotUnchanged: true,
          estimateError: error,
          relativeEstimateError: error / Number(estimate.totalValue),
          observations,
        }),
    );
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((error) => {
  console.log('FUND_CALIBRATION_FAILURE=' + JSON.stringify(evidence));
  console.error(error.message);
  process.exitCode = 1;
});
