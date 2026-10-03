import { z } from 'zod';
import type {
  BacktestNavSourceRequestV3,
  BacktestNavSourceResponseV3,
} from '@thesis-ledger/schemas';
import type { NavEnvelope } from './dsa-nav-envelope.js';
import { navEqual, navHash, navInvalid, navTimeBefore, parseNavRaw } from './dsa-nav-raw.js';

/** 与来源审查登记一致；仅明确核验的基金、版本、文件和区间可消费。 */
const reviewed = {
  '110011.OF': {
    version: 'efunds-110011-20260701-audit-20260930',
    delay: 1,
    start: '2026-07-01',
    hash: 'bc6940d7f3209ff05571e20727200d69ca78ffce593d6a6921fb0ec521c4f1c4',
    url: 'https://cdn.efunds.com.cn/owch/data/bulletin/20260701/易方达优质精选混合型证券投资基金更新的招募说明书.pdf',
  },
  '118001.OF': {
    version: 'efunds-118001-20260727-audit-20260930',
    delay: 2,
    start: '2026-07-27',
    hash: '2c0ac2a0eb177f9966a7dd254e2bdf29c269654baf9c489928898068594d068b',
    url: 'https://cdn.efunds.com.cn/owch/data/bulletin/20260727/易方达亚洲精选股票型证券投资基金更新的招募说明书.pdf',
  },
};
const domesticDecisionSchema = z.strictObject({
  schemaVersion: z.literal('nav-research-default-v1'),
  symbol: z.string(),
  fundType: z.literal('domestic'),
  delayWorkdays: z.literal(1),
  applicableRange: z.strictObject({ startDate: z.iso.date(), endDate: z.iso.date() }),
  configuredAt: z.iso.datetime({ offset: true }),
  decision: z.string().trim().min(1),
});
type NavRule = Extract<
  BacktestNavSourceResponseV3['navVisibility'],
  { mode: 'research-assumption' }
>['rule'];

export function verifyNavIdentity(request: BacktestNavSourceRequestV3, envelope: NavEnvelope) {
  const identity = envelope.identity;
  if (
    Buffer.byteLength(identity.responseRaw) > 8 * 1024 * 1024 ||
    identity.responseHash !== navHash(identity.responseRaw) ||
    identity.symbol !== request.symbol ||
    envelope.fundType !== request.fundType ||
    identity.fundType !== request.fundType ||
    !/^\s*var\s+reData\s*=/.test(identity.responseRaw)
  )
    navInvalid();
  const raw = identity.responseRaw.replace(/^\s*var\s+reData\s*=\s*/, '').replace(/;\s*$/, '');
  const data = z
    .object({ datas: z.array(z.array(z.unknown())).min(1).max(100000) })
    .parse(parseNavRaw(raw, true));
  const rows = data.datas.filter((row) => row[0] === request.symbol.slice(0, 6));
  if (rows.length !== 1 || rows[0]?.[2] !== identity.sourceType) navInvalid();
  const kind = identity.sourceType;
  if (request.fundType === 'qdii') {
    if (!/^QDII(?:-[^\s]+)?$/.test(kind)) navInvalid();
  } else if (
    !/^(?:股票型|混合型|债券型|货币型|理财型|FOF)(?:-[^\s]+)?$/.test(kind) &&
    !['指数型', '指数型-股票', '指数型-固收', '指数型-其他'].includes(kind)
  )
    navInvalid();
}

export function verifyNavRule(
  request: BacktestNavSourceRequestV3,
  response: BacktestNavSourceResponseV3,
  envelope: NavEnvelope,
) {
  const visibility = response.navVisibility;
  if (visibility.mode !== 'research-assumption') navInvalid();
  const { contentHash, ...rule } = visibility.rule;
  const proof = envelope.ruleDocument;
  const bytes = Buffer.from(proof.raw, 'base64');
  if (
    !navEqual(parseNavRaw(response.ruleRaw), rule) ||
    navHash(response.ruleRaw) !== contentHash ||
    bytes.toString('base64') !== proof.raw ||
    bytes.length > 8 * 1024 * 1024 ||
    navHash(bytes) !== rule.documentHash ||
    proof.contentHash !== rule.documentHash ||
    rule.fundType !== request.fundType
  )
    navInvalid();
  navTimeBefore(rule.configuredAt, response.source.capturedAt);
  navTimeBefore(proof.capturedAt, response.source.capturedAt);
  if (request.fundType === 'domestic') {
    verifyDomesticRule(request, rule, proof, bytes);
  } else {
    verifyReviewedRule(request, rule, proof, bytes);
  }
}

function verifyDomesticRule(
  request: BacktestNavSourceRequestV3,
  rule: Omit<NavRule, 'contentHash'>,
  proof: NavEnvelope['ruleDocument'],
  bytes: Buffer,
) {
  if (
    request.symbol in reviewed ||
    proof.kind !== 'research-config' ||
    proof.readerRevision !== 'nav-user-default-v1' ||
    bytes.toString('utf8') !== request.domesticRuleDecisionRaw
  )
    navInvalid();
  const decision = domesticDecisionSchema.parse(parseNavRaw(bytes.toString('utf8')));
  const expected = {
    id: `nav-domestic-default:${request.symbol}`,
    version: 'user-t1-default-v1',
    symbol: request.symbol,
    fundType: 'domestic',
    applicableRange: decision.applicableRange,
    delayWorkdays: 1,
    basis: 'domestic-default',
    evidenceRef: `research-config://nav-domestic/${navHash(bytes)}`,
    documentHash: navHash(bytes),
    configuredAt: decision.configuredAt,
  };
  if (decision.symbol !== request.symbol || !navEqual(rule, expected)) navInvalid();
}

function verifyReviewedRule(
  request: BacktestNavSourceRequestV3,
  rule: Omit<NavRule, 'contentHash'>,
  proof: NavEnvelope['ruleDocument'],
  bytes: Buffer,
) {
  const spec = reviewed[request.symbol as keyof typeof reviewed];
  if (
    !spec ||
    proof.kind !== 'fund-prospectus' ||
    proof.readerRevision !== 'efunds-nav-disclosure-document-v1' ||
    !bytes.subarray(0, 5).equals(Buffer.from('%PDF-')) ||
    rule.documentHash !== spec.hash ||
    rule.id !== `nav-disclosure:${request.symbol}` ||
    rule.version !== spec.version ||
    rule.delayWorkdays !== spec.delay ||
    rule.evidenceRef !== spec.url ||
    rule.basis !== 'verified-fund-rule' ||
    rule.applicableRange.startDate < spec.start ||
    rule.applicableRange.endDate > '2026-09-30'
  )
    navInvalid();
}
