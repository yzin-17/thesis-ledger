import { fundDailyErrorSchema } from '@thesis-ledger/schemas';
import samples from './fund-daily-number-samples.json';
export { samples as fundDailySamples };
export function fundDailyNumberSample(name: string) {
  const sample = samples.find((value) => value.name === name);
  if (!sample) throw new Error('未知的每日估算数字样本');
  return fundDailyErrorSchema.parse({
    symbol: '000001.OF',
    day: '2026-11-07',
    method: 'disclosed-holdings-qfq-v1',
    estimatedAt: '2026-11-07T07:00:00.000Z',
    estimatedNav: sample.estimatedNav,
    pricedCoverage: 1e-9,
    quality: 'low_coverage',
    official: {
      unitNav: sample.unitNav,
      navDate: '2026-11-07T00:00:00.000Z',
      provider: '受控来源',
      upstreamSource: '受控来源',
      fetchedAt: '2026-11-07T08:00:00.000Z',
      servedFromCache: true,
    },
    errors: {
      signed: sample.signed,
      absolute: sample.signed.replace(/^-/, ''),
      relativeAbsolute: '0.000000001',
    },
  });
}
