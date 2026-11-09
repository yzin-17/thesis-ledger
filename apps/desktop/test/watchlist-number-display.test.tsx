import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { WatchlistRange } from '../src/features/watchlist/WatchlistRange';
import { WatchlistCandles } from '../src/features/watchlist/WatchlistCandles';
import { watchlistNumberSample, watchlistNumberSamples } from './watchlist-number-samples';
it.each([...watchlistNumberSamples.map((s) => s.name), 'nav', 'unavailable'])(
  '%s：日内读数保留共享精度及原始值',
  (name) => {
    const { prices, expected } = watchlistNumberSample(name),
      snap = prices[0]!,
      before = structuredClone(snap);
    const markup = renderToStaticMarkup(<WatchlistRange snap={snap} />);
    const text = markup.replace(/<[^>]*>/g, '');
    if (snap.price.kind === 'quote') {
      expect(text).toContain('振幅 ' + expected.amplitude);
      expect(text).toContain('今开 ' + expected.open);
      expect(text).toContain('前收 ' + expected.previousClose);
      expect(text).toContain('低 ' + expected.low);
      expect(text).toContain('高 ' + expected.high);
      expect(markup).not.toMatch(/NaN|Infinity/);
    } else {
      expect(markup).not.toContain('<svg');
      expect(text).toContain(snap.price.kind === 'nav' ? '净值无分时数据' : '暂无日内区间');
    }
    expect(snap).toEqual(before);
  },
);
it('尚未取得报价时保持未知区间', () => {
  const markup = renderToStaticMarkup(<WatchlistRange />);
  expect(markup).toContain('暂无日内区间');
  expect(markup).not.toContain('<svg');
});
it('平盘及区间之外的前收如实展示，缺失今开使用未知值', () => {
  const snap = structuredClone(watchlistNumberSample('ordinary').prices[0]!);
  if (snap.price.kind !== 'quote') throw new Error('需要报价样本');
  Object.assign(snap.price.quote, { low: 4, high: 4, price: 4, open: 4, previousClose: 4 });
  expect(renderToStaticMarkup(<WatchlistRange snap={snap} />).replace(/<[^>]*>/g, '')).toContain(
    '低 4',
  );
  Object.assign(snap.price.quote, {
    low: 4,
    high: 5,
    price: 4.5,
    open: undefined,
    previousClose: 6,
  });
  const markup = renderToStaticMarkup(<WatchlistRange snap={snap} />);
  const text = markup.replace(/<[^>]*>/g, '');
  expect(text).toContain('前收 6');
  expect(text).toContain('今开 —');
});
it('日K线平盘、极小值和缺失OHLC不产生非法坐标或伪造烛形', () => {
  const candles = [{ at: '2026-11-06', open: 1e-10, high: 1e-10, low: 1e-10, close: 1e-10 }];
  const markup = renderToStaticMarkup(<WatchlistCandles candles={candles} />);
  expect(markup).toContain('日K线，1个交易日');
  expect(markup).toContain('1E-10');
  expect(markup).not.toMatch(/NaN|Infinity/);
  expect(renderToStaticMarkup(<WatchlistCandles candles={[{ ...candles[0]!, open: NaN }]} />)).toBe(
    '',
  );
});
