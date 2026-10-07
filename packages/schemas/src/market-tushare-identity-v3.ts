import { z } from 'zod';
import { marketEventAdmissionV3Schema } from './market-event-admission-v3.js';
import { compareMarketPitEvidenceInstantStringsV1 } from './market-pit-evidence-instant-v1.js';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const symbol = z.string().regex(/^[0-9]{6}\.(SH|SZ)$/);
const instant = z
  .string()
  .refine((value) => compareMarketPitEvidenceInstantStringsV1(value, value) === 0);
const date = z.iso.date().refine((value) => instant.safeParse(`${value}T00:00:00Z`).success);
const document = {
  documentUrl: z.string().refine((value) => {
    try {
      const url = new URL(value);
      const authority = /^https:\/\/([^/?#]*)/i.exec(value)?.[1];
      return (
        !!authority &&
        !authority.includes('@') &&
        !authority.includes('\\') &&
        url.protocol === 'https:' &&
        Array.from(value).every(
          (character) => character.charCodeAt(0) > 32 && character.charCodeAt(0) !== 127,
        ) &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  }, '原文引用必须为不含账号的 HTTPS URL'),
  documentSha256: digest,
};
const mapping = z
  .strictObject({
    symbol,
    instrumentType: z.literal('ETF'),
    queryFundCode: symbol,
    scopeDateFrom: date,
    scopeDateTo: date,
    observedAt: instant,
    identityEvidence: z.strictObject(document),
    dividendCurrencyEvidence: z.strictObject({
      ...document,
      currency: z.enum(['CNY', 'HKD', 'USD']),
    }),
  })
  .superRefine((value, ctx) => {
    if (value.queryFundCode !== value.symbol || value.scopeDateFrom > value.scopeDateTo)
      ctx.addIssue({ code: 'custom', message: 'Tushare 基金直接映射或范围无效' });
  });

export const marketTushareFundIdentityV3Schema = z
  .strictObject({
    contractVersion: z.literal(1),
    kind: z.literal('tushare-fund-identity'),
    mappings: z.array(mapping).min(1).max(1000),
  })
  .superRefine((value, ctx) => {
    if (new Set(value.mappings.map((item) => item.symbol)).size !== value.mappings.length)
      ctx.addIssue({ code: 'custom', message: 'Tushare 身份映射重复' });
  });
export type MarketTushareFundIdentityV3 = z.infer<typeof marketTushareFundIdentityV3Schema>;

export const marketTushareIdentityEvidenceV3Schema = z.strictObject({
  ref: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  sha256: digest,
  content: z
    .string()
    .min(1)
    .max(1024 * 1024)
    .refine(
      (value) =>
        new TextEncoder().encode(value).length <= 1024 * 1024 &&
        !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value),
      'Tushare 原文必须为不超过 1 MiB 的 UTF-8 字节',
    ),
});

/** 先核对原文大小与语法，再按解码后的字段名拒绝任何层级的重复键。 */
export function parseMarketTushareFundIdentityV3(content: string): MarketTushareFundIdentityV3 {
  marketTushareIdentityEvidenceV3Schema.shape.content.parse(content);
  const value: unknown = JSON.parse(content);
  const stack: Array<{ object: boolean; keys: Set<string>; keyExpected: boolean }> = [];
  for (const match of content.matchAll(
    /"(?:[^"\\]|\\.)*"|[{}[\]:,]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
  )) {
    const token = match[0];
    const top = stack.at(-1);
    if (/^-?\d/.test(token)) {
      if (token !== '1') throw new Error('Tushare 身份原文只允许整数版本 1');
    } else if (token === '{' || token === '[') {
      stack.push({ object: token === '{', keys: new Set(), keyExpected: true });
    } else if (token === '}' || token === ']') {
      stack.pop();
    } else if (top?.object) {
      if (token === ',') top.keyExpected = true;
      else if (token === ':') top.keyExpected = false;
      else if (top.keyExpected) {
        const key = JSON.parse(token) as string;
        if (top.keys.has(key)) throw new Error('Tushare 身份原文包含重复 JSON 字段');
        top.keys.add(key);
      }
    }
  }
  return marketTushareFundIdentityV3Schema.parse(value);
}

/** 此分支只替换精确 Tushare 现金路由的旧毫秒有效期判断。 */
export const marketTushareEventAdmissionV3Schema = z
  .strictObject({
    ...marketEventAdmissionV3Schema.shape,
    evidenceRef: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    scopeSymbols: z.array(symbol).min(1),
    scopeDateFrom: date,
    scopeDateTo: date,
    validFrom: instant,
    validUntil: instant,
    recordedAt: instant,
  })
  .superRefine((value, ctx) => {
    if (
      !isMarketTushareCashIdentityRouteV3({
        routeKey: value.routeKey,
        routeTarget: value.target,
      }) ||
      compareMarketPitEvidenceInstantStringsV1(value.validFrom, value.validUntil) !== -1 ||
      value.scopeDateFrom > value.scopeDateTo ||
      new Set(value.scopeSymbols).size !== value.scopeSymbols.length
    )
      ctx.addIssue({ code: 'custom', message: 'Tushare 精确准入无效' });
  });

type IdentityResponse = {
  tushareIdentityEvidence?: z.infer<typeof marketTushareIdentityEvidenceV3Schema> | undefined;
  admission?: z.infer<typeof marketEventAdmissionV3Schema> | undefined;
  identityEvidence?: unknown;
  dateMappingEvidence?: unknown;
  routeTarget: { providerId: string; upstreamSource: string };
  routeKey: { kind: string; market: string; assetType: string; capability: string };
  symbol: string;
  start: string;
  end: string;
  fetchedAt: string;
  dataAsOf: string;
  facts: readonly { currency?: string | undefined; availableAt: string }[];
};

export function isMarketTushareCashIdentityRouteV3(
  response: Pick<IdentityResponse, 'routeKey' | 'routeTarget'>,
): boolean {
  return (
    response.routeKey.kind === 'data' &&
    response.routeKey.market === 'CN' &&
    response.routeKey.assetType === 'ETF' &&
    response.routeKey.capability === 'CASH_DISTRIBUTION' &&
    response.routeTarget.providerId === 'tushare' &&
    response.routeTarget.upstreamSource === 'tushare'
  );
}

function notAfter(left: string, right: string): boolean {
  const order = compareMarketPitEvidenceInstantStringsV1(left, right);
  return order !== undefined && order <= 0;
}

function validateTushareAdmissionResponse(
  response: IdentityResponse,
  admission: z.infer<typeof marketTushareEventAdmissionV3Schema>,
  evidence: z.infer<typeof marketTushareIdentityEvidenceV3Schema>,
): void {
  symbol.parse(response.symbol);
  date.parse(response.start);
  date.parse(response.end);
  if (
    evidence.ref !== `sha256:${evidence.sha256}` ||
    evidence.ref !== admission.evidenceRef ||
    evidence.sha256 !== admission.evidenceSha256 ||
    !admission.scopeSymbols.includes(response.symbol) ||
    admission.scopeDateFrom > response.start ||
    admission.scopeDateTo < response.end ||
    response.start > response.end
  )
    throw new Error('Tushare 身份原文摘要或请求范围不匹配');
  if (
    !notAfter(admission.validFrom, response.fetchedAt) ||
    compareMarketPitEvidenceInstantStringsV1(response.fetchedAt, admission.validUntil) !== -1 ||
    !notAfter(admission.recordedAt, response.fetchedAt) ||
    !notAfter(admission.recordedAt, response.dataAsOf)
  )
    throw new Error('Tushare 准入超出观察或冻结截点');
}

function validateTushareBundleResponse(
  response: IdentityResponse,
  admission: z.infer<typeof marketTushareEventAdmissionV3Schema>,
  bundle: MarketTushareFundIdentityV3,
): void {
  for (const item of bundle.mappings) {
    if (
      !admission.scopeSymbols.includes(item.symbol) ||
      item.scopeDateFrom < admission.scopeDateFrom ||
      item.scopeDateTo > admission.scopeDateTo ||
      !notAfter(item.observedAt, admission.recordedAt) ||
      !notAfter(item.observedAt, response.fetchedAt) ||
      !notAfter(item.observedAt, response.dataAsOf)
    )
      throw new Error('Tushare 身份证据超出准入范围或观察截点');
  }
  const selected = bundle.mappings.find(
    (item) =>
      item.symbol === response.symbol &&
      item.scopeDateFrom <= response.start &&
      response.end <= item.scopeDateTo,
  );
  if (!selected) throw new Error('Tushare 请求缺少完整身份映射');
  if (
    response.facts.some(
      (fact) =>
        fact.currency !== selected.dividendCurrencyEvidence.currency ||
        !notAfter(fact.availableAt, response.dataAsOf) ||
        !notAfter(fact.availableAt, response.fetchedAt),
    )
  )
    throw new Error('Tushare 分红币种或事实观察截点不匹配');
}

/** 不散列重排后的 JSON；实际原字节摘要由 Server 在线与离线消费者另行核验。 */
export function validateMarketTushareIdentityResponseV3(response: IdentityResponse): void {
  const evidence = response.tushareIdentityEvidence;
  const exact = isMarketTushareCashIdentityRouteV3(response);
  if (!exact && !evidence) return;
  if (
    !exact ||
    !evidence ||
    !response.admission ||
    response.identityEvidence ||
    response.dateMappingEvidence
  )
    throw new Error('Tushare 身份原文与精确来源或准入不匹配');
  const admission = marketTushareEventAdmissionV3Schema.parse(response.admission);
  marketTushareIdentityEvidenceV3Schema.parse(evidence);
  validateTushareAdmissionResponse(response, admission, evidence);
  validateTushareBundleResponse(
    response,
    admission,
    parseMarketTushareFundIdentityV3(evidence.content),
  );
}
