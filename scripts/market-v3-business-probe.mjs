import { randomUUID } from 'node:crypto';
import {
  chipDistributionSchema,
  fundHoldingsSchema,
  fundNavHistorySchema,
  fundNavSchema,
  fxRatesResponseSchema,
  marketDataBarSeriesRequestV3Schema,
  marketDataBarSeriesResponseV3Schema,
  quoteSchema,
} from '../packages/schemas/dist/index.js';

/** 对当前 DSA Data 合同做正向业务读取；每项失败均阻断业务验收。 */
export async function probeMarketV3Business({ origin, dataToken, barRequest, fetchImpl = fetch }) {
  let target;
  try {
    target = new URL(origin);
  } catch {
    throw new Error('V3 业务检查需要有效的 DSA origin');
  }
  if (
    !['http:', 'https:'].includes(target.protocol) ||
    target.username ||
    target.password ||
    target.pathname !== '/' ||
    target.search ||
    target.hash
  )
    throw new Error('DSA origin 必须只包含 HTTP(S) 协议、主机与端口');
  if (!dataToken?.trim()) throw new Error('V3 业务检查缺少 Data Token');
  const request = marketDataBarSeriesRequestV3Schema.safeParse({
    ...barRequest,
    requestId: randomUUID(),
  });
  if (!request.success) throw new Error('V3 业务检查需要有效的 Bar 请求');
  const call = async (path, init = {}) => {
    let response;
    try {
      response = await fetchImpl(new URL(path, target), {
        ...init,
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${dataToken.trim()}`,
          ...init.headers,
        },
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new Error(`V3 业务端点请求失败：${path}`);
    }
    if (response.status !== 200) {
      await response.body?.cancel();
      throw new Error(`V3 业务端点状态异常：${path} (${response.status})`);
    }
    try {
      return await response.json();
    } catch {
      throw new Error(`V3 业务端点未返回 JSON：${path}`);
    }
  };
  const parse = (schema, value, path) => {
    const result = schema.safeParse(value);
    if (!result.success) throw new Error(`V3 业务端点响应合同无效：${path}`);
    return result.data;
  };
  const quotePath = '/api/v3/thesis-ledger/market/quote?symbol=600519.SH';
  const quote = parse(quoteSchema, await call(quotePath), quotePath);
  if (quote.symbol !== '600519.SH') throw new Error('V3 报价标的身份不匹配');
  const etfQuotePath = '/api/v3/thesis-ledger/market/quote?symbol=510300.SH';
  const etfQuote = parse(quoteSchema, await call(etfQuotePath), etfQuotePath);
  if (etfQuote.symbol !== '510300.SH') throw new Error('V3 ETF 报价标的身份不匹配');
  const navPath = '/api/v3/thesis-ledger/market/fund-nav?symbol=000001.OF';
  const nav = parse(fundNavSchema, await call(navPath), navPath);
  if (nav.symbol !== '000001.OF') throw new Error('V3 基金净值标的身份不匹配');
  const historyPath = '/api/v3/thesis-ledger/market/fund-nav/history?symbol=000001.OF&limit=5';
  const history = parse(fundNavHistorySchema, await call(historyPath), historyPath);
  if (history.length === 0 || history.some((point) => point.symbol !== nav.symbol))
    throw new Error('V3 基金净值历史缺失或标的身份不匹配');
  const holdingsPath = '/api/v3/thesis-ledger/market/fund-holdings?symbol=000001.OF';
  const holdings = parse(fundHoldingsSchema, await call(holdingsPath), holdingsPath);
  if (holdings.fundSymbol !== nav.symbol) throw new Error('V3 基金持仓标的身份不匹配');
  const fxPath = '/api/v3/thesis-ledger/market/fx-rates?baseCurrency=CNY&currencies=CNY';
  const fx = parse(fxRatesResponseSchema, await call(fxPath), fxPath);
  if (
    fx.baseCurrency !== 'CNY' ||
    !fx.rates.some(
      (rate) =>
        rate.fromCurrency === 'CNY' &&
        rate.toCurrency === 'CNY' &&
        rate.available &&
        rate.rate === 1,
    )
  )
    throw new Error('V3 CNY 自身汇率合同不完整');
  const chipPath = '/api/v3/thesis-ledger/market/chip?symbol=600519.SH';
  const chip = parse(chipDistributionSchema, await call(chipPath), chipPath);
  if (chip.symbol !== quote.symbol) throw new Error('V3 筹码标的身份不匹配');
  const barsPath = '/api/v3/thesis-ledger/market/bars';
  const bars = parse(
    marketDataBarSeriesResponseV3Schema,
    await call(barsPath, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request.data),
    }),
    barsPath,
  );
  if (
    bars.requestId !== request.data.requestId ||
    bars.symbol !== request.data.symbol ||
    bars.bars.length === 0 ||
    bars.coverage.requestedStart !== request.data.start ||
    bars.coverage.requestedEnd !== request.data.end ||
    JSON.stringify(bars.routeKey) !== JSON.stringify(request.data.routeKey)
  )
    throw new Error('V3 Bar 请求身份或完整覆盖不满足业务验收');
  return {
    status: 'passed',
    scope: 'market-v3-business-read',
    quoteProvider: quote.provider,
    etfQuoteProvider: etfQuote.provider,
    fundNavProvider: nav.provider,
    barProvider: bars.provenance.providerId,
    barCount: bars.bars.length,
  };
}
