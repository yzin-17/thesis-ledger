import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BacktestPublicFeesDisclosure } from '../src/features/strategy/BacktestPublicFeesDisclosure.js';
import { publicFeesDiagnosticExport } from '../src/features/strategy/backtest-public-fees-diagnostic.js';
const response = (market: string) => JSON.parse(readFileSync(new URL(
  `../../../packages/schemas/fixtures/market-${market}-public-fees-expanded-v3.response.json`, import.meta.url), 'utf8')).response;

describe('港美新增费项与真实基数披露', () => {
  it('港股显示独立AFRC及印花税整港元进位', () => {
    const html = renderToStaticMarkup(<BacktestPublicFeesDisclosure disclosure={{ status: 'source', response: response('hk') }} />);
    expect(html).toContain('会财局交易征费');
    expect(html).toContain('每笔进位至整港元');
    expect(html).toContain('0.00015%');
  });
  it('美股显示美元每股、上限和低价豁免，未知发布日期不补造', () => {
    const html = renderToStaticMarkup(<BacktestPublicFeesDisclosure disclosure={{ status: 'source', response: response('us') }} />);
    expect(html).toContain('FINRA交易活动费');
    expect(html).toContain('0.000166');
    expect(html).toContain('美元／股');
    expect(html).toContain('8.30');
    expect(html).toContain('发布日期未知');
    expect(html).not.toContain('0.0166%');
  });
  it('诊断保留逐项算法维度、来源摘要与精确时钟', () => {
    const raw = response('us');
    const exported = publicFeesDiagnosticExport({ status: 'source', response: raw }, (value) => typeof value === 'string' ? value : null)!;
    if (exported.status !== 'source') throw new Error('source expected');
    expect(exported.segments[0]!.charges).toEqual(raw.segments[0].charges);
    expect(exported.sourceDocuments[3]!.publishedDate).toBeNull();
    expect(exported.sourceDocuments[4]!.sha256).toBe(raw.sourceDocuments[4].sha256);
    expect(exported.sourceDocuments[4]!.observedAt).toBe(raw.sourceDocuments[4].observedAt);
  });
});
