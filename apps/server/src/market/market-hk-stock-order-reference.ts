import { DecimalValue, marketSessionDate } from '@thesis-ledger/domain';
import type { DsaClient } from '../integration/dsa/dsa.client.js';
import { readSecurityLotSize } from '../integration/dsa/dsa-security-lot-size.js';
import type { MarketService } from './market.service.js';

const EFFECTIVE_FROM = '2026-08-03';
const MINIMUM_PRICE = '0.01';
const PRICE_BANDS = [
  { upperInclusive: '0.25', increment: '0.001' },
  { upperInclusive: '10', increment: '0.005' },
  { upperInclusive: '20', increment: '0.01' },
  { upperInclusive: '50', increment: '0.02' },
  { upperInclusive: '100', increment: '0.05' },
  { upperInclusive: '200', increment: '0.1' },
  { upperInclusive: '500', increment: '0.2' },
  { upperInclusive: '1000', increment: '0.5' },
  { upperInclusive: '2000', increment: '1' },
  { upperInclusive: '5000', increment: '2' },
  { upperInclusive: '9995', increment: '5' },
] as const;

type Quote = Pick<Awaited<ReturnType<MarketService['getQuote']>>, 'symbol' | 'price' | 'units'>;

function quoteIncrement(symbol: string, quote: Quote) {
  if (
    quote.symbol !== symbol ||
    quote.units?.priceCurrency !== 'HKD' ||
    !(
      quote.price >= Number(MINIMUM_PRICE) &&
      quote.price <= Number(PRICE_BANDS.at(-1)!.upperInclusive)
    )
  )
    return null;
  const price = DecimalValue.from(String(quote.price));
  return PRICE_BANDS.find((band) => price.compareTo(band.upperInclusive) <= 0)?.increment ?? null;
}

/** 交易单位是证券观察。价位表是普通港元股票的市场级参考。 */
export async function readHkStockOrderReference(
  dsa: Pick<DsaClient, 'post'>,
  symbol: string,
  quote: Quote,
  at: Date,
) {
  const boardLot = await readSecurityLotSize(dsa, symbol).then(
    ({ symbol, sharesPerLot, historicalChanges, source, routeTarget }) => ({
      status: 'available' as const,
      symbol,
      sharesPerLot,
      historicalChanges,
      source,
      routeTarget,
    }),
    () => ({ status: 'unavailable' as const, reason: 'lot_size_unavailable' }),
  );
  return { boardLot, spreadTable: hkStockPriceReference(symbol, quote, at) };
}

export function hkStockPriceReference(symbol: string, quote: Quote, at: Date) {
  const day = marketSessionDate(at, 'Asia/Hong_Kong');
  return day < EFFECTIVE_FROM
    ? null
    : {
        code: '01',
        currency: 'HKD',
        appliesTo: 'ordinary_stock',
        effectiveFrom: EFFECTIVE_FROM,
        minimumPrice: MINIMUM_PRICE,
        bands: PRICE_BANDS,
        incrementAtQuote: quoteIncrement(symbol, quote),
        sourceUrl:
          'https://www.hkex.com.hk/Services/Trading/Securities/Overview/Trading-Mechanism/Reduction-of-Minimum-Spreads?sc_lang=zh-cn',
      };
}
