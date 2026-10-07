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
    queryThscode: symbol,
    fundType: z.literal('exchange'),
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
    if (value.queryThscode !== value.symbol || value.scopeDateFrom > value.scopeDateTo)
      ctx.addIssue({ code: 'custom', message: 'HiThink 基金直接映射或范围无效' });
  });

export const marketHithinkFundIdentityV3Schema = z
  .strictObject({
    contractVersion: z.literal(1),
    kind: z.literal('hithink-fund-identity'),
    mappings: z.array(mapping).min(1).max(1000),
  })
  .superRefine((value, ctx) => {
    if (new Set(value.mappings.map((item) => item.symbol)).size !== value.mappings.length)
      ctx.addIssue({ code: 'custom', message: 'HiThink 身份映射重复' });
  });
export type MarketHithinkFundIdentityV3 = z.infer<typeof marketHithinkFundIdentityV3Schema>;

export const marketHithinkIdentityEvidenceV3Schema = z.strictObject({
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
      'HiThink 原文必须为不超过 1 MiB 的 UTF-8 字节',
    ),
});

/** 保留原文供字节摘要复核，并拒绝所有层级的重复 JSON 键。 */
export function parseMarketHithinkFundIdentityV3(content: string): MarketHithinkFundIdentityV3 {
  marketHithinkIdentityEvidenceV3Schema.shape.content.parse(content);
  const value: unknown = JSON.parse(content);
  const stack: Array<{ object: boolean; keys: Set<string>; keyExpected: boolean }> = [];
  for (const match of content.matchAll(
    /"(?:[^"\\]|\\.)*"|[{}[\]:,]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
  )) {
    const token = match[0];
    const top = stack.at(-1);
    if (/^-?\d/.test(token)) {
      if (token !== '1') throw new Error('HiThink 身份原文只允许整数版本 1');
    } else if (token === '{' || token === '[') {
      stack.push({ object: token === '{', keys: new Set(), keyExpected: true });
    } else if (token === '}' || token === ']') {
      stack.pop();
    } else if (top?.object) {
      if (token === ',') top.keyExpected = true;
      else if (token === ':') top.keyExpected = false;
      else if (top.keyExpected) {
        const key = JSON.parse(token) as string;
        if (top.keys.has(key)) throw new Error('HiThink 身份原文包含重复 JSON 字段');
        top.keys.add(key);
      }
    }
  }
  return marketHithinkFundIdentityV3Schema.parse(value);
}

export const marketHithinkEventAdmissionV3Schema = z
  .strictObject({
    ...marketEventAdmissionV3Schema.shape,
    evidenceRef: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    scopeSymbols: z.array(symbol).min(1),
    scopeDateFrom: date,
    scopeDateTo: date,
    adapterRevision: z.literal('dsa-hithink-fund-dividend-v1'),
    sourceRevision: z.literal('hithink-fund-dividends-single-response-v1'),
    credentialRevision: z.string().regex(/^hmac-sha256-v1:[a-f0-9]{64}$/),
    validFrom: instant,
    validUntil: instant,
    recordedAt: instant,
  })
  .superRefine((value, ctx) => {
    if (
      !isMarketHithinkCashIdentityRouteV3({
        routeKey: value.routeKey,
        routeTarget: value.target,
      }) ||
      compareMarketPitEvidenceInstantStringsV1(value.validFrom, value.validUntil) !== -1 ||
      value.scopeDateFrom > value.scopeDateTo ||
      new Set(value.scopeSymbols).size !== value.scopeSymbols.length
    )
      ctx.addIssue({ code: 'custom', message: 'HiThink 精确准入无效' });
  });

type IdentityResponse = {
  hithinkIdentityEvidence?: z.infer<typeof marketHithinkIdentityEvidenceV3Schema> | undefined;
  admission?: z.infer<typeof marketEventAdmissionV3Schema> | undefined;
  identityEvidence?: unknown;
  tushareIdentityEvidence?: unknown;
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

export function isMarketHithinkCashIdentityRouteV3(
  response: Pick<IdentityResponse, 'routeKey' | 'routeTarget'>,
): boolean {
  return (
    response.routeKey.kind === 'data' &&
    response.routeKey.market === 'CN' &&
    response.routeKey.assetType === 'ETF' &&
    response.routeKey.capability === 'CASH_DISTRIBUTION' &&
    response.routeTarget.providerId === 'hithink' &&
    response.routeTarget.upstreamSource === 'fund-corporate-actions-dividends'
  );
}

function notAfter(left: string, right: string): boolean {
  const order = compareMarketPitEvidenceInstantStringsV1(left, right);
  return order !== undefined && order <= 0;
}

/** Schema 核对声明的证据关联；在线与离线消费者另按原字节重新散列。 */
export function validateMarketHithinkIdentityResponseV3(response: IdentityResponse): void {
  const evidence = response.hithinkIdentityEvidence;
  const exact = isMarketHithinkCashIdentityRouteV3(response);
  if (!exact && !evidence) return;
  if (
    !exact ||
    !evidence ||
    !response.admission ||
    response.identityEvidence ||
    response.tushareIdentityEvidence ||
    response.dateMappingEvidence
  )
    throw new Error('HiThink 身份原文与精确来源或准入不匹配');
  const admission = marketHithinkEventAdmissionV3Schema.parse(response.admission);
  marketHithinkIdentityEvidenceV3Schema.parse(evidence);
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
    throw new Error('HiThink 身份原文摘要或请求范围不匹配');
  if (
    !notAfter(admission.validFrom, response.fetchedAt) ||
    compareMarketPitEvidenceInstantStringsV1(response.fetchedAt, admission.validUntil) !== -1 ||
    !notAfter(admission.recordedAt, response.fetchedAt) ||
    !notAfter(admission.recordedAt, response.dataAsOf)
  )
    throw new Error('HiThink 准入超出观察或冻结截点');
  const bundle = parseMarketHithinkFundIdentityV3(evidence.content);
  for (const item of bundle.mappings) {
    if (
      !admission.scopeSymbols.includes(item.symbol) ||
      item.scopeDateFrom < admission.scopeDateFrom ||
      item.scopeDateTo > admission.scopeDateTo ||
      !notAfter(item.observedAt, admission.recordedAt) ||
      !notAfter(item.observedAt, response.fetchedAt) ||
      !notAfter(item.observedAt, response.dataAsOf)
    )
      throw new Error('HiThink 身份证据超出准入范围或观察截点');
  }
  const selected = bundle.mappings.find(
    (item) =>
      item.symbol === response.symbol &&
      item.scopeDateFrom <= response.start &&
      response.end <= item.scopeDateTo,
  );
  if (!selected) throw new Error('HiThink 请求缺少完整身份映射');
  if (
    response.facts.some(
      (fact) =>
        fact.currency !== selected.dividendCurrencyEvidence.currency ||
        !notAfter(fact.availableAt, response.dataAsOf) ||
        !notAfter(fact.availableAt, response.fetchedAt),
    )
  )
    throw new Error('HiThink 分红币种或事实观察截点不匹配');
}
