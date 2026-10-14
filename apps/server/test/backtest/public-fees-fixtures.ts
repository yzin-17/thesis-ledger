import { readFile } from 'node:fs/promises';
import {
  backtestExecutionModelSchemaV3,
  marketPublicFeesResponseV3Schema,
  marketPublicFeesRequestV3Schema,
} from '@thesis-ledger/schemas';

export const publicFeeInputs = async (archive = false) => {
  const rawModel = JSON.parse(
    await readFile(
      new URL(
        '../../../../packages/schemas/fixtures/backtest-execution-model.cn-2024q1.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const rawFees = JSON.parse(
    await readFile(
      new URL(
        archive
          ? '../../../../packages/schemas/fixtures/market-public-fees-v3.archive-response.json'
          : '../../../../packages/schemas/fixtures/market-public-fees-v3.response.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  rawModel.scope.symbol = '600000.SH';
  rawModel.scope.range = { start: '2023-08-25', end: '2023-08-29' };
  rawModel.segments[0].range = rawModel.scope.range;
  return {
    model: backtestExecutionModelSchemaV3.parse(rawModel),
    fees: marketPublicFeesResponseV3Schema.parse(rawFees.response),
    request: marketPublicFeesRequestV3Schema.parse(rawFees.request),
  };
};
