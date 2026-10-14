import { z } from 'zod';
import { marketQuoteSymbolSchema } from './market-quote-identity.js';

const decimal = z.string().max(64).regex(/^(0|[1-9]\d*)(\.\d+)?$/);
const positive = decimal.refine((value) => Number(value) > 0 && Number.isFinite(Number(value)), '数值必须有限且为正');
const quantity = decimal.refine((value) => Number.isFinite(Number(value)), '数量必须有限');
const text = z.string().min(1).refine((value) => value.trim() === value, '标识不得包含首尾空白');
const timestamp = z.iso.datetime({ offset: true });
const matchesMarket = (symbol: string, market: string) => {
  if (market === 'HK') return symbol.endsWith('.HK');
  if (market === 'US') return symbol.endsWith('.US');
  return /\.(SH|SZ|BJ)$/.test(symbol);
};

export const orderBookRequestV1Schema = z.strictObject({
  symbol: marketQuoteSymbolSchema,
  market: z.enum(['CN', 'HK', 'US']),
  depth: z.number().int().min(1).max(100),
  allowDepthDegradation: z.boolean().default(false),
}).superRefine((request, context) => {
  if (!matchesMarket(request.symbol, request.market)) {
    context.addIssue({ code: 'custom', path: ['symbol'], message: '证券代码与市场不一致' });
  }
});

const level = z.strictObject({ price: positive, quantity, orderCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable() });

/** 隔离能力合同；未在生产能力目录或 API 中登记。 */
export const orderBookV1Schema = z.strictObject({
  contractVersion: z.literal(1),
  capability: z.literal('ORDER_BOOK'),
  symbol: marketQuoteSymbolSchema,
  market: z.enum(['CN', 'HK', 'US']),
  venue: text.nullable(),
  coverage: z.enum(['venue', 'consolidated', 'unknown']),
  priceCurrency: z.enum(['CNY', 'HKD', 'USD', 'unknown']),
  quantityUnit: z.enum(['share', 'contract', 'unknown']),
  requestedDepth: z.number().int().min(1).max(100),
  sourceDepthLimit: z.number().int().min(1).max(100).nullable(),
  depthDegraded: z.boolean(),
  bids: z.array(level).max(100),
  asks: z.array(level).max(100),
  sourceEventTime: timestamp.nullable(),
  receivedAt: timestamp,
  sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
  target: z.strictObject({ providerId: text, upstreamSource: text }),
  adapterRevision: text,
  dataNature: z.enum(['realtime', 'delayed', 'sampled', 'unknown']),
  state: z.enum(['valid', 'stale']),
  continuity: z.enum(['verified', 'unknown']),
}).superRefine((book, context) => {
  if (!matchesMarket(book.symbol, book.market)) {
    context.addIssue({ code: 'custom', path: ['symbol'], message: '证券代码与市场不一致' });
  }
  for (const side of ['bids', 'asks'] as const) {
    const rows = book[side];
    const limit = Math.min(book.requestedDepth, book.sourceDepthLimit ?? book.requestedDepth);
    if (rows.length > limit) context.addIssue({ code: 'custom', path: [side], message: '档位超过已声明深度' });
    rows.forEach((row, index) => {
      if (index === 0) return;
      const before = rows[index - 1]!.price;
      const after = row.price;
      const beforeScale = before.split('.')[1]?.length ?? 0;
      const afterScale = after.split('.')[1]?.length ?? 0;
      const scale = Math.max(beforeScale, afterScale);
      const previous = BigInt(before.replace('.', '') + '0'.repeat(scale - beforeScale));
      const current = BigInt(after.replace('.', '') + '0'.repeat(scale - afterScale));
      if (side === 'bids' ? previous <= current : previous >= current) {
        context.addIssue({ code: 'custom', path: [side, index], message: '价位必须唯一且按买降卖升排序' });
      }
    });
  }
  const degraded = book.sourceDepthLimit !== null && book.sourceDepthLimit < book.requestedDepth;
  if (book.depthDegraded !== degraded) context.addIssue({ code: 'custom', path: ['depthDegraded'], message: '深度降级声明与来源能力不一致' });
  if (book.continuity === 'verified' && (book.sequence === null || book.state !== 'valid')) {
    context.addIssue({ code: 'custom', path: ['continuity'], message: '缺少序列或状态失效时不能证明连续性' });
  }
});

export const orderBookRequestResponseV1Schema = z.strictObject({
  request: orderBookRequestV1Schema,
  response: orderBookV1Schema,
}).superRefine(({ request, response }, context) => {
  if (request.symbol !== response.symbol || request.market !== response.market || request.depth !== response.requestedDepth) {
    context.addIssue({ code: 'custom', path: ['response'], message: '盘口与请求身份或深度不一致' });
  }
  if (response.depthDegraded && !request.allowDepthDegradation) {
    context.addIssue({ code: 'custom', path: ['response', 'depthDegraded'], message: '调用方未允许深度降级' });
  }
});

export type OrderBookRequestV1 = z.infer<typeof orderBookRequestV1Schema>;
export type OrderBookV1 = z.infer<typeof orderBookV1Schema>;
