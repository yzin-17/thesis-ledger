import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { historicalExecutionContextSchema } from '@thesis-ledger/schemas';

const load = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.shared.json`, import.meta.url), 'utf8'));
function reconstructed(symbol = '588000.SH') {
  const base = load('historical-execution').context;
  const page = load('sse-halt-history').cases.find((c: { symbol: string }) => c.symbol === symbol).page;
  base.fact.symbol = symbol;
  base.evidence = [...base.evidence.filter((e: { kind: string }) => e.kind === 'rule'), page];
  base.trading = { state: 'trading', intradayHalts: [], evidenceRefs: [page.id], basis: {
    method: 'sse-fund-halts-v1',
    listing: { listedOn: '2020-01-01', delistedOn: null, evidenceRefs: ['rules'] },
    session: { startAt: '2026-11-10T05:00:00Z', endAt: '2026-11-10T07:00:00Z', evidenceRefs: ['rules'] },
    query: { symbol, day: '2026-11-10', pages: 1, total: 0, evidenceRefs: [page.id] },
  } };
  return base;
}

describe('历史重建证据跨语言合同', () => {
  it.each(['588000.SH', '510300.SH'])('%s 保留真实采集时刻，不编造历史发布时间', symbol => {
    const context = historicalExecutionContextSchema.parse(reconstructed(symbol));
    expect(context.trading.state).toBe('trading');
    expect(context.evidence.at(-1)?.kind).toBe('reconstruction');
    expect(context.evidence.at(-1)).not.toHaveProperty('availableAt');
  });
  it.each(['orphan', 'fake-time', 'http-error', 'not-listed', 'delisted', 'outside-session',
    'naive-session', 'missing-identity', 'missing-calendar', 'wrong-symbol', 'wrong-day', 'wrong-pages',
    'false-total', 'wrong-kind', 'future-rule', 'inconsistent-state', 'wrong-asset', 'extra-basis', 'bad-clock'])(
    '%s 仍然拒绝', mutation => {
      const context = reconstructed(), { basis } = context.trading;
      if (mutation === 'orphan') delete context.trading.basis;
      if (mutation === 'fake-time') context.evidence.at(-1).availableAt = context.asOf;
      if (mutation === 'http-error') context.evidence.at(-1).httpStatus = 503;
      if (mutation === 'not-listed') basis.listing.listedOn = '2026-11-11';
      if (mutation === 'delisted') basis.listing.delistedOn = '2026-11-10';
      if (mutation === 'outside-session') basis.session.startAt = '2026-11-10T06:00:00Z';
      if (mutation === 'naive-session') basis.session.startAt = '2026-11-10T05:00:00';
      if (mutation === 'missing-identity') basis.listing.evidenceRefs = ['missing'];
      if (mutation === 'missing-calendar') basis.session.evidenceRefs = ['missing'];
      if (mutation === 'wrong-symbol') basis.query.symbol = '510300.SH';
      if (mutation === 'wrong-day') basis.query.day = '2026-11-09';
      if (mutation === 'wrong-pages') basis.query.pages = 2;
      if (mutation === 'false-total') basis.query.total = false;
      if (mutation === 'wrong-kind') context.trading.evidenceRefs = ['rules'];
      if (mutation === 'future-rule') context.evidence[0].availableAt = '2026-11-11T00:00:00Z';
      if (mutation === 'inconsistent-state') context.trading.state = 'suspended';
      if (mutation === 'wrong-asset') context.fact.instrumentType = 'STOCK';
      if (mutation === 'extra-basis') basis.assumeTrading = true;
      if (mutation === 'bad-clock') context.asOf = 'bad';
      expect(historicalExecutionContextSchema.safeParse(context).success).toBe(false);
    });
});
