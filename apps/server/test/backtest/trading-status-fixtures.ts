import { readFile } from 'node:fs/promises';
import {
  marketTradingStatusResponseV3Schema,
  marketTradingStatusRequestV3Schema,
} from '@thesis-ledger/schemas';
import { buildInput } from './v3-snapshot-fixtures.js';

export const tradingStatusInputs = async () => {
  const raw = JSON.parse(
    await readFile(
      new URL(
        '../../../../packages/schemas/fixtures/market-trading-status-v3.response.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  return {
    response: marketTradingStatusResponseV3Schema.parse(raw.response),
    request: marketTradingStatusRequestV3Schema.parse(raw.request),
  };
};

export const tradingStatusRunConfig = async () => {
  const { input } = await buildInput();
  const { response } = await tradingStatusInputs();
  const runConfig = input.runConfig;
  const model = runConfig.executionModel!;
  runConfig.startDate = response.range.start;
  runConfig.endDate = response.range.end;
  model.scope = {
    ...model.scope,
    symbol: response.symbol,
    instrumentType: 'STOCK',
    range: response.range,
  };
  model.segments.forEach((segment) => {
    segment.range = response.range;
  });
  return runConfig;
};
