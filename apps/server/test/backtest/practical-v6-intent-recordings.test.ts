import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it, vi } from 'vitest';
import { aiGenerationContracts, type BacktestResearchDataScope, type BacktestStrategy } from '@thesis-ledger/schemas';
import { practicalV6IntentReview } from './practical-v6-intent-oracle.fixture.js';
import { authoringOperationSchema } from '../../src/strategy-authoring/authoring-operation-schema.js';
import type { AuthoringOperation } from '../../src/strategy-authoring/authoring-operation.repository.js';
import { compileBacktestStrategy } from '../../src/backtest/backtest-strategy-compiler.js';

const root = process.env.PRACTICAL_V6_RECORDINGS_ROOT;
const ids = ['count-confirmation', 'statistics-gap', 'captured-retest', 'timeframes-anchor',
  'session-vwap-arithmetic', 'hfq-only-discovery', 'stop-only-policy'];
const expected = {
  'v22-seven-final1': [true, true, false, true, true, true, true],
  'v23-seven-final1': [false, false, true, false, true, true, true],
  'v24-seven-final1': [true, false, false, false, true, true, true],
  'v25-seven-loop1': [true, false, true, true, false, true, false],
};

it.skipIf(!root)('四轮28份真实回执零网络独立判断，旧业务结论不回写', () => {
  expect(resolve(root!)).toContain('/var/acceptance/');
  const network = vi.fn(() => { throw new Error('原回执核对禁止真实网络请求'); });
  vi.stubGlobal('fetch', network);
  const reports: unknown[] = [];
  try {
    for (const [batch, passed] of Object.entries(expected)) {
      const directory = resolve(root!, batch);
      const read = (name: string) => JSON.parse(readFileSync(resolve(directory, name), 'utf8')) as {
        definition?: BacktestStrategy;
        compilation?: { candidate?: BacktestStrategy };
        diagnostics?: { candidate?: BacktestStrategy };
      };
      for (const [index, id] of ids.entries()) {
        const record = read(id + '.json');
        const candidate = record.definition ?? record.compilation?.candidate ?? record.diagnostics?.candidate;
        let actual = false;
        let detail: unknown;
        if (candidate) {
          const input = JSON.parse(readFileSync(resolve(directory, id + '-input.json'), 'utf8')) as {
            operation?: { input: { content: { definitionText: string } } };
          };
          const baseline = id === 'stop-only-policy' ? JSON.parse(input.operation!.input.content.definitionText) as BacktestStrategy : undefined;
          const result = practicalV6IntentReview(id, candidate, baseline);
          actual = result.passed;
          detail = result;
        } else if (batch === 'v25-seven-loop1' && id === 'session-vwap-arithmetic') {
          const { operation } = JSON.parse(readFileSync(resolve(directory, id + '-input.json'), 'utf8')) as {
            operation: AuthoringOperation;
          };
          const wire = JSON.parse(readFileSync(resolve(directory, 'authoring/wire-output-1-1.json'), 'utf8'));
          const parsed = authoringOperationSchema(operation).safeParse(wire);
          expect(parsed.success).toBe(false);
          detail = { passed: false, stage: 'coverage_structure' };
        } else {
          expect(batch + '/' + id).toBe('v23-seven-final1/timeframes-anchor');
          const wire = JSON.parse(readFileSync(resolve(directory, 'discovery/wire-output-4-1.json'), 'utf8'));
          const parsed = aiGenerationContracts.strategyDiscovery.schema.safeParse(wire);
          expect(parsed.success).toBe(false);
          detail = { passed: false, stage: 'structure' };
        }
        expect(actual, batch + '/' + id).toBe(passed[index]);
        reports.push({ batch, id, ...detail as object });
      }
    }
    expect(network).not.toHaveBeenCalled();
    if (process.env.PRACTICAL_V6_RECORDINGS_REPORT) writeFileSync(process.env.PRACTICAL_V6_RECORDINGS_REPORT,
      JSON.stringify({ modelCalls: 0, networkRequests: 0, reports }, null, 2), { flag: 'wx', mode: 0o600 });
  } finally { vi.unstubAllGlobals(); }
});

it.skipIf(!root)('真实会话原输出与仅改变坐标的对照明确区分冻结研究能力', () => {
  const directory = resolve(root!, 'v27-seven-final1');
  const { dataScope } = JSON.parse(readFileSync(resolve(directory, 'session-vwap-arithmetic-input.json'), 'utf8')) as {
    dataScope: BacktestResearchDataScope;
  };
  const { proposal: { definition } } = JSON.parse(readFileSync(resolve(directory, 'authoring/wire-output-1-1.json'), 'utf8')) as {
    proposal: { definition: BacktestStrategy };
  };
  const original = JSON.stringify(definition);
  const network = vi.fn(() => { throw new Error('成对核对禁止真实网络请求'); });
  vi.stubGlobal('fetch', network);
  try {
    expect(definition.signalSources[0]?.priceCoordinate).toBe('actual');
    expect(compileBacktestStrategy(definition, dataScope).status).toBe('rejected');
    const reference = { ...definition, signalSources: definition.signalSources.map((source) => ({
      ...source, priceCoordinate: 'research',
    })) };
    expect(compileBacktestStrategy(reference, dataScope).status).toBe('compiled');
    expect(network).not.toHaveBeenCalled();
    expect(JSON.stringify(definition)).toBe(original);
  } finally { vi.unstubAllGlobals(); }
});
