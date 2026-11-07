import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { WatchlistRange } from '../src/features/watchlist/WatchlistRange';
import { watchlistNumberSample, watchlistNumberSamples } from './watchlist-number-samples';
it.each([...watchlistNumberSamples.map((s) => s.name), 'nav', 'unavailable'])(
  '%s：日内振幅、价格及原 SVG 区间',
  (name) => {
    const { prices, expected } = watchlistNumberSample(name),
      snap = prices[0]!,
      before = structuredClone(snap);
    const markup = renderToStaticMarkup(<WatchlistRange snap={snap} />);
    expect(markup).toContain('振幅 ' + expected.amplitude);
    expect(markup).toContain('今开 ' + expected.open + ' · 前收 ' + expected.previousClose);
    if (snap.price.kind === 'quote') {
      expect(markup).toContain(
        '日内最低' + expected.low + '，最高' + expected.high + '，当前' + expected.value,
      );
      expect(markup).not.toMatch(/NaN|Infinity/);
      if (snap.price.quote.high === snap.price.quote.low) expect(markup).toContain('cx="50"');
    } else expect(markup).not.toContain('<svg');
    expect(snap).toEqual(before);
  },
);
it('尚未取得报价时保持未知区间', () => {
  const markup = renderToStaticMarkup(<WatchlistRange />);
  expect(markup).toContain('振幅 —');
  expect(markup).not.toContain('<svg');
});
