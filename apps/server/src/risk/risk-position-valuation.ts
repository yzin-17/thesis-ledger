import { Prisma } from '@prisma/client';
import { DecimalValue } from '@thesis-ledger/domain';
import type { Currency, Quote } from '@thesis-ledger/schemas';
import type { ResolvedFx } from '../market/fx-conversion.js';
import type { MarketService } from '../market/market.service.js';

export type RiskPosition = Prisma.PositionGetPayload<{ include: { asset: true } }>;
export type RiskValuedPosition = {
  position: RiskPosition;
  currency?: Currency;
  price?: number;
  value?: DecimalValue;
  quality: Record<string, string>;
};

export const riskDecimal = (value: Prisma.Decimal.Value) =>
  DecimalValue.from(new Prisma.Decimal(value).toFixed());

const validTime = (time: string | null, upper: string) =>
  time !== null && Number.isFinite(Date.parse(time)) && Date.parse(time) <= Date.parse(upper);

const qualifiedQuote = (quote: Quote, symbol: string, marketTime: string) =>
  quote.symbol === symbol &&
  !quote.stale &&
  ['live', 'delayed'].includes(quote.freshness) &&
  validTime(quote.marketTime, marketTime);

export const valueRiskPosition = async (
  position: RiskPosition,
  market: MarketService,
  marketTime: string,
): Promise<RiskValuedPosition> => {
  const quality: Record<string, string> = { marketData: 'unavailable' };
  const result: RiskValuedPosition = { position, quality };
  const reject = (reason: string): never => {
    quality.valuationReason = reason;
    throw new Error(reason);
  };
  try {
    const fund = position.asset.assetType === 'fund' || /\.OF$/.test(position.symbol);
    let price: number;
    if (fund) {
      if (position.asset.currency !== 'CNY') reject('基金正式净值币种与持仓币种不一致');
      const nav = await market.getFundNav(position.symbol, { allowStale: false });
      if (
        nav.symbol !== position.symbol ||
        nav.freshness !== 'delayed' ||
        nav.fallbackUsed ||
        !validTime(nav.navDate, marketTime)
      )
        reject('正式基金净值质量或时点不合格');
      price = nav.unitNav;
      quality.priceTime = nav.navDate;
      quality.priceProvider = nav.provider;
      quality.priceBasis = 'official-nav';
    } else {
      const quote = await market.getQuote(position.symbol, { allowStale: false });
      if (!qualifiedQuote(quote, position.symbol, marketTime)) reject('报价质量或时点不合格');
      if (quote.units && quote.units.priceCurrency !== position.asset.currency)
        reject('报价币种与持仓币种不一致');
      price = quote.price;
      quality.priceTime = quote.marketTime!;
      quality.priceProvider = quote.provider;
      quality.priceBasis = 'quote';
    }
    if (!Number.isFinite(price) || price < 0) reject('价格不是有效非负数');
    const currency = position.asset.currency;
    if (currency !== 'CNY' && currency !== 'USD' && currency !== 'HKD')
      return reject('持仓币种不受支持');
    result.price = price;
    quality.marketData = 'fresh';
    result.currency = currency;
    quality.priceCurrency = currency;
    const quantity = riskDecimal(position.quantity);
    if (quantity.isNegative()) reject('持仓数量为负数');
    result.value = quantity.times(riskDecimal(price));
  } catch {
    quality.valuationReason ??= '价格或持仓估值不可用';
  }
  return result;
};

const qualifiedRate = (currency: Currency, base: Currency, fx: ResolvedFx, marketTime: string) => {
  if (currency === base) return DecimalValue.from('1');
  // 当前数据合同已规范化为直接汇率；不自行推断日期、方向或缺失时区。
  const rate = fx.meta.rates.find(
    (row) => row.fromCurrency === currency && row.toCurrency === base,
  );
  if (
    !rate?.available ||
    rate.stale ||
    !['live', 'delayed'].includes(rate.freshness) ||
    rate.rate === undefined ||
    !Number.isFinite(rate.rate) ||
    rate.rate <= 0 ||
    !rate.rateDate ||
    rate.rateDate > marketTime.slice(0, 10) ||
    rate.ageDays === null
  )
    return undefined;
  return riskDecimal(rate.rate);
};

export const hasRiskBaseValue = (
  row: RiskValuedPosition,
  base: Currency,
  fx: ResolvedFx,
  marketTime: string,
) =>
  row.value !== undefined &&
  row.currency !== undefined &&
  qualifiedRate(row.currency, base, fx, marketTime) !== undefined;

export const riskScopeWeights = (
  rows: readonly RiskValuedPosition[],
  base: Currency,
  fx: ResolvedFx,
  marketTime: string,
) => {
  const values = new Map<string, DecimalValue>();
  let total = DecimalValue.from('0');
  for (const row of rows) {
    if (!row.value || !row.currency) return { complete: false, reason: '持仓估值不完整', base };
    const rate = qualifiedRate(row.currency, base, fx, marketTime);
    if (!rate) return { complete: false, reason: '必要汇率缺失、过期或日期不合格', base };
    const value = row.value.times(rate);
    values.set(row.position.id, value);
    total = total.plus(value);
  }
  if (!total.isPositive()) return { complete: false, reason: '持仓市值分母不为正数', base };
  const weights = new Map<string, number>();
  for (const [id, value] of values) {
    const weight = Number(value.dividedBy(total).toString());
    if (!Number.isFinite(weight) || weight < 0 || weight > 1)
      return { complete: false, reason: '持仓比例无法表达为有效数值', base };
    weights.set(id, weight);
  }
  return { complete: true, base, weights };
};
