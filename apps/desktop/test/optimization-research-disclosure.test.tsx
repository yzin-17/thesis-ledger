import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  backtestExecutionModelSchemaV3,
  executionPriceProtocolSchema,
  runConfigSchemaV3,
} from '@thesis-ledger/schemas';
import { OptimizationResearchDisclosure } from '../src/features/strategy/OptimizationResearchDisclosure.js';

const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(new URL(`../../../packages/schemas/fixtures/${name}`, import.meta.url), 'utf8'),
  );
const config = () => {
  const model = backtestExecutionModelSchemaV3.parse(
    fixture('backtest-execution-model.cn-2024q1.json'),
  );
  for (const segment of model.segments) {
    segment.execution.price = { kind: 'noDailyLimit', reason: '归一化研究模型' };
    segment.execution.normalizedExecution = {
      priceCoordinate: 'continuous-decimal',
      quantityUnits: 'continuous-normalized-decimal',
      lotSizeConstraint: 'not-applied',
      tickSizeConstraint: 'not-applied',
      dailyPriceLimit: 'not-applied',
      feeBasis: 'simulatedTurnover',
    };
  }
  return runConfigSchemaV3.parse({
    schemaVersion: '3',
    startDate: '2024-01-02',
    endDate: '2024-03-29',
    dataAsOf: '2026-09-11T00:00:00Z',
    baseCurrency: 'CNY',
    initialCash: { CNY: '10000' },
    valuationPolicy: {
      baseTimezone: 'Asia/Shanghai',
      dailyValuationTime: '15:00',
      pricePolicy: 'latestAvailable',
      fxPolicy: 'latestAvailable',
    },
    executionModel: model,
    executionPriceProtocol: executionPriceProtocolSchema.parse(
      fixture('execution-price.normalized-snapshot.json'),
    ),
    priceInputBindings: { signals: [], benchmark: { binding: 'execution-series' } },
  });
};

describe('AI 候选对比的研究性质披露', () => {
  it('固定快照说明测试集封存不等于无前视，披露份额与分红限制', () => {
    const markup = renderToStaticMarkup(<OptimizationResearchDisclosure runConfig={config()} />);
    for (const text of [
      '前复权',
      '归一化份额研究',
      '即使测试集尚未揭示',
      '不构成严格无前视',
      '分红含义未完全确认',
      '冻结时间',
      '实际来源与重放版本',
    ])
      expect(markup).toContain(text);
    expect(markup).not.toContain('严格历史时点输入');
  });
  it.each([undefined, { schemaVersion: '2' }, { schemaVersion: '3', executionPriceProtocol: {} }])(
    '缺失或无效协议不推断成严格历史输入',
    (runConfig) => {
      const markup = renderToStaticMarkup(<OptimizationResearchDisclosure runConfig={runConfig} />);
      expect(markup).toContain('实验价格协议未确认');
      expect(markup).not.toContain('严格历史时点输入');
    },
  );
});
