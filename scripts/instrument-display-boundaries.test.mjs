import assert from 'node:assert/strict';
import test from 'node:test';
import { instrumentDisplayBoundaryViolation as check } from './instrument-display-boundaries.mjs';

const risk = 'apps/server/src/risk/risk-rule.service.ts';
const ready = 'InstrumentDisplayService; this.display.resolve(symbols);';
test('当前业务名称需要公共读取服务，拒绝旧 Asset 查询和传入旧名遮蔽', () => {
  assert.match(check(risk, 'prisma.asset.findMany({ select: { name: true } })'), /公共名称服务/u);
  assert.match(check(risk, `${ready} prisma.asset.findMany({});`), /Asset/u);
  assert.match(check(risk, `${ready} context.assetName || name`), /遮蔽/u);
  assert.equal(check(risk, ready), null);
});
test('名称服务保持 Market 所有权与单向依赖', () => {
  assert.match(
    check(
      'apps/server/src/market/instruments/instrument-display.service.ts',
      "import { PortfolioService } from '../../portfolio/portfolio.service.js'",
    ),
    /反向依赖/u,
  );
});
test('冻结实例原样读取允许通过，新实例不能复制旧计划名', () => {
  const file = 'apps/server/src/fund-plans/recurring-fund-investment.service.ts';
  assert.match(check(file, `${ready} fundName: plan.fundName`), /生成边界/u);
  assert.equal(check(file, `${ready} return occurrence;`), null);
  assert.equal(
    check(
      'apps/server/src/notifications/fund-investment-notification.ts',
      'fundName: occurrence.fundName',
    ),
    null,
  );
});
