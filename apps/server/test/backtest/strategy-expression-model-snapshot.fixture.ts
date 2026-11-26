import type { BacktestStrategy } from '@thesis-ledger/schemas';
import { collectUsedSignalSources } from '../../src/backtest/backtest-dependency-price.js';
import { prepareBacktestRunConfigV3 } from '../../src/backtest/backtest-run-preparation.js';
import { hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';
import { multitimeframeFixture } from './expression-multitimeframe.fixture.js';
import { priceResearchFixture } from './price-research.fixtures.js';
import { freezeTradePlanFixture, tradePlanSnapshot } from './trade-plan-snapshot.fixture.js';

/** 原样冻结模型定义；独立模拟日线和分钟数据，不补写模型条件或执行政策。 */
export async function expressionModelSnapshot(root: string, strategy: BacktestStrategy) {
  const used = collectUsedSignalSources(strategy);
  const needsAdditionalBase = used.some(
    (source) => (source.timeframe === '1d') !== (strategy.primaryTimeframe === '1d'),
  );
  if (!needsAdditionalBase) return tradePlanSnapshot(root, strategy);
  const f = await multitimeframeFixture(strategy.primaryTimeframe === '1d' ? '1d' : '60m');
  const research = await priceResearchFixture();
  f.input.strategy = strategy;
  f.input.strategyVersionHash = hashCanonicalManifest(strategy);
  const prepared = await prepareBacktestRunConfigV3({
    request: research.request,
    strategy,
    reader: f.reader,
    control: research.control,
    checkedAt: f.input.runConfig.dataAsOf,
    researchCalendar: f.researchCalendar,

  });
  if (prepared.status !== 'prepared')
    throw new Error('多周期模型受控准备失败：' + JSON.stringify(prepared));
  f.input.runConfig = prepared.runConfig;
  f.input.executionRouteKey.adjustment = 'hfq';
  return freezeTradePlanFixture(root, { ...f, dsa: research.dsa });
}
