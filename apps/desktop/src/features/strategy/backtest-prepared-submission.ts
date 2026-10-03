import { backtestRunCreateSchemaV3 } from '@thesis-ledger/schemas';
import type { BacktestSetupInput } from './strategy.types.js';

export function preparedBacktestSubmission(
  strategyVersionId: string,
  setup: BacktestSetupInput,
  idempotencyKey: string,
) {
  const prepared = setup.prepared;
  if (!prepared) throw new Error('请先准备并确认复权研究配置');
  const config = prepared.runConfig;
  const currency = setup.baseCurrency ?? 'CNY';
  if (
    prepared.executionPreflight.revisionStamp?.strategyVersionId !== strategyVersionId ||
    config.startDate !== setup.period.start ||
    config.endDate !== setup.period.end ||
    config.baseCurrency !== currency ||
    Number(config.initialCash[currency]) !== setup.initialCash ||
    config.executionPriceProtocol.priceBasis.adjustment !== setup.adjustment
  )
    throw new Error('准备结果与当前回测配置不一致，请重新准备');
  return backtestRunCreateSchemaV3.parse({
    contractVersion: 3,
    strategyVersionId,
    runConfig: config,
    preparationStamp: prepared.executionPreflight.revisionStamp,
    idempotencyKey,
  });
}
