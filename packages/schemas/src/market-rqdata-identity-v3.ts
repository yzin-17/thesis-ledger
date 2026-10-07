import { z } from 'zod';
import type { marketEventAdmissionV3Schema } from './market-event-admission-v3.js';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const document = {
  documentUrl: z.url({ protocol: /^https$/ }).refine((value) => {
    try {
      const url = new URL(value);
      return value === value.trim() && !url.username && !url.password;
    } catch {
      return false;
    }
  }, '原文引用必须为不含账号的 HTTPS URL'),
  documentSha256: digest,
};
const mapping = z
  .strictObject({
    symbol: z.string().regex(/^[0-9]{6}\.(SH|SZ)$/),
    instrumentType: z.literal('ETF'),
    queryFundCode: z.string().regex(/^[0-9]{6}$/),
    scopeDateFrom: z.iso.date(),
    scopeDateTo: z.iso.date(),
    observedAt: z.iso.datetime({ offset: true }),
    identityEvidence: z.strictObject(document),
    dividendCurrencyEvidence: z
      .strictObject({ ...document, currency: z.enum(['CNY', 'HKD', 'USD']) })
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.queryFundCode !== value.symbol.slice(0, 6) || value.scopeDateFrom > value.scopeDateTo)
      ctx.addIssue({ code: 'custom', message: 'RQData 基金直接映射或范围无效' });
  });

export const marketRqdataFundIdentityV3Schema = z
  .strictObject({
    contractVersion: z.literal(1),
    kind: z.literal('rqdata-fund-identity'),
    mappings: z.array(mapping).min(1).max(1000),
  })
  .superRefine((value, ctx) => {
    if (new Set(value.mappings.map((item) => item.symbol)).size !== value.mappings.length)
      ctx.addIssue({ code: 'custom', message: 'RQData 身份映射重复' });
  });
export type MarketRqdataFundIdentityV3 = z.infer<typeof marketRqdataFundIdentityV3Schema>;

export const marketRqdataIdentityEvidenceV3Schema = z.strictObject({
  ref: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  sha256: digest,
  content: z
    .string()
    .min(1)
    .max(1024 * 1024),
});

/** 原生 JSON.parse 验证语法；局部词法检查保留转义后的重复字段拒绝语义。 */
export function parseMarketRqdataFundIdentityV3(content: string): MarketRqdataFundIdentityV3 {
  const value: unknown = JSON.parse(content);
  const stack: Array<{ kind: 'object' | 'array'; keys: Set<string>; keyExpected: boolean }> = [];
  for (const match of content.matchAll(/"(?:[^"\\]|\\.)*"|[{}[\]:,]/g)) {
    const token = match[0];
    const top = stack.at(-1);
    if (token === '{' || token === '[') {
      stack.push({ kind: token === '{' ? 'object' : 'array', keys: new Set(), keyExpected: true });
    } else if (token === '}' || token === ']') {
      stack.pop();
    } else if (top?.kind === 'object') {
      if (token === ',') top.keyExpected = true;
      else if (token === ':') top.keyExpected = false;
      else if (top.keyExpected) {
        const key = JSON.parse(token) as string;
        if (top.keys.has(key)) throw new Error('RQData 身份原文包含重复 JSON 字段');
        top.keys.add(key);
      }
    }
  }
  return marketRqdataFundIdentityV3Schema.parse(value);
}

type IdentityResponse = {
  identityEvidence?: z.infer<typeof marketRqdataIdentityEvidenceV3Schema> | undefined;
  admission?: z.infer<typeof marketEventAdmissionV3Schema> | undefined;
  dateMappingEvidence?: unknown;
  routeTarget: { providerId: string; upstreamSource: string };
  routeKey: { market: string; assetType: string; capability: string };
  symbol: string;
  start: string;
  end: string;
  fetchedAt: string;
  dataAsOf: string;
  facts: readonly { currency?: string | undefined }[];
};
/** 来源原文只用于明确准入的 ETF 身份；实际字节摘要由执行端另行重验。 */
export function validateMarketRqdataIdentityResponseV3(response: IdentityResponse): void {
  const evidence = response.identityEvidence;
  const rqdata = response.routeTarget.providerId === 'rqdata';
  if (!rqdata && !evidence) return;
  const admission = response.admission;
  if (
    !rqdata ||
    response.routeTarget.upstreamSource !== 'rqdata' ||
    response.routeKey.market !== 'CN' ||
    response.routeKey.assetType !== 'ETF' ||
    !evidence ||
    !admission ||
    response.dateMappingEvidence ||
    evidence.ref !== `sha256:${evidence.sha256}` ||
    evidence.ref !== admission.evidenceRef ||
    evidence.sha256 !== admission.evidenceSha256
  )
    throw new Error('RQData 身份原文与精确来源或准入不匹配');
  const recorded = Date.parse(admission.recordedAt);
  const cutoff = Math.min(Date.parse(response.fetchedAt), Date.parse(response.dataAsOf), recorded);
  if (recorded > Date.parse(response.dataAsOf)) throw new Error('RQData 身份准入晚于冻结截点');
  const bundle = parseMarketRqdataFundIdentityV3(evidence.content);
  for (const item of bundle.mappings) {
    if (
      !admission.scopeSymbols.includes(item.symbol) ||
      item.scopeDateFrom < admission.scopeDateFrom ||
      item.scopeDateTo > admission.scopeDateTo ||
      Date.parse(item.observedAt) > cutoff
    )
      throw new Error('RQData 身份证据超出准入范围或观察截点');
  }
  const selected = bundle.mappings.find(
    (item) =>
      item.symbol === response.symbol &&
      item.scopeDateFrom <= response.start &&
      response.end <= item.scopeDateTo,
  );
  if (!selected) throw new Error('RQData 请求缺少完整身份映射');
  if (response.routeKey.capability === 'CASH_DISTRIBUTION') {
    const currency = selected.dividendCurrencyEvidence?.currency;
    if (!currency || response.facts.some((fact) => fact.currency !== currency))
      throw new Error('RQData 分红币种与独立证据不匹配');
  }
}
