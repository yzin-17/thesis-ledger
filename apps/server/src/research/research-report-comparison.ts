import { createHash } from 'node:crypto';
import { isEqual } from 'es-toolkit';
import {
  researchComparisonIdentity,
  researchReportComparisonSchema,
  researchReportSummarySchema,
  type ResearchReportComparison,
  type ResearchResultV2,
} from '@thesis-ledger/schemas';
import type { AiResearchReportComparisonRead } from '../ai/ai-research-reports.query.js';

type Group = ResearchReportComparison['groups'][number];
type Field = Group['fields'][number];
type Source = AiResearchReportComparisonRead['current'];
type Audit = ResearchResultV2['evidenceBindings'][number]['audit'];
const labels = {
  opinion: '观点字段',
  evidence: '引用证据',
  conditions: '失效条件与期限',
  inputs: '输入质量与路由',
  model: 'Prompt 与模型',
} as const;

/** 模型输出内的临时编号及引用绑定另作证据比较，不冒充观点内容变化。 */
function inferenceValue(value: unknown): Field['before'] {
  if (Array.isArray(value)) return value.map(inferenceValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key, field]) =>
            field !== undefined && !['id', 'evidenceId', 'evidenceIds', 'claimId'].includes(key),
        )
        .map(([key, field]) => [key, inferenceValue(field)]),
    );
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return value;
  return null;
}
function field(key: string, label: string, before: unknown, after: unknown, text = false): Field {
  const left = inferenceValue(before),
    right = inferenceValue(after);
  let status: Field['status'] = 'unchanged';
  if (!isEqual(left, right)) status = text ? 'text_changed' : 'value_changed';
  return { key, label, status, before: left, after: right };
}
function group(key: Group['key'], fields: Field[]): Group {
  return {
    key,
    label: labels[key],
    status: fields.some((entry) => entry.status !== 'unchanged') ? 'changed' : 'unchanged',
    fields,
  };
}
function emptyGroups(): Group[] {
  return Object.entries(labels).map(([key, label]) => ({
    key: key as Group['key'],
    label,
    status: 'unavailable',
    fields: [],
  }));
}
function result(source: Source) {
  if (source.detail.availability !== 'available' || source.detail.result?.version !== 2)
    return null;
  return source.detail.result;
}
function auditsByFingerprint(source: ResearchResultV2) {
  const byFingerprint = new Map<string, Audit[]>();
  for (const { audit } of source.evidenceBindings) {
    const items = byFingerprint.get(audit.fingerprint) ?? [];
    items.push(audit);
    byFingerprint.set(audit.fingerprint, items);
  }
  return byFingerprint;
}
function evidencePairs(before: ResearchResultV2, after: ResearchResultV2) {
  const left = auditsByFingerprint(before),
    right = auditsByFingerprint(after);
  const side = (items: Audit[] = []) =>
    items
      .map((audit) => ({
        evidenceId: audit.evidenceId,
        providerId: audit.providerId,
        sourceIds: [...audit.sourceIds].sort(),
      }))
      .sort((a, b) => {
        if (a.evidenceId === b.evidenceId) return 0;
        return a.evidenceId < b.evidenceId ? -1 : 1;
      });
  return [...new Set([...left.keys(), ...right.keys()])].sort().map((fingerprint) => {
    const l = left.get(fingerprint) ?? [],
      r = right.get(fingerprint) ?? [];
    let status: ResearchReportComparison['evidence'][number]['status'] = 'unchanged';
    if (!l.length) status = 'added';
    else if (!r.length) status = 'removed';
    return {
      fingerprint,
      kind: (l[0] ?? r[0]!).kind,
      status,
      before: side(l),
      after: side(r),
    };
  });
}
function routes(source: NonNullable<Source['frozen']>) {
  return source.evidence
    .map(({ audit }) => ({
      kind: audit.kind,
      providerId: audit.providerId,
      sourceIds: [...audit.sourceIds].sort(),
      contractVersion: audit.contractVersion,
      policyRevision: audit.policyRevision,
      routeRevision: audit.routeRevision,
      credentialRevision: audit.credentialRevision,
    }))
    .sort((a, b) => {
      const left = JSON.stringify(a),
        right = JSON.stringify(b);
      if (left === right) return 0;
      return left < right ? -1 : 1;
    });
}
function scopeInputs(source: NonNullable<Source['frozen']>) {
  const scope = source.scopeSnapshot;
  const base = { version: scope.version, mode: scope.mode, scope: scope.scope };
  if (scope.scope === 'instrument') return { ...base, instrument: scope.instrument };
  if (scope.scope === 'position')
    return { ...base, accountId: scope.accountId, instrument: scope.instrument };
  const instruments = [...scope.instruments].sort((a, b) => {
    if (a.instrumentId === b.instrumentId) return 0;
    return a.instrumentId < b.instrumentId ? -1 : 1;
  });
  if (scope.scope === 'portfolio')
    return {
      ...base,
      portfolioId: scope.portfolioId,
      accountIds: [...scope.accountIds].sort(),
      instruments,
    };
  if (scope.scope === 'account') return { ...base, accountId: scope.accountId, instruments };
  return { ...base, strategyVersionId: scope.strategyVersionId, instruments };
}
/** 数据资料版本不包含提交编号、准备/权限确认时间或执行设置。 */
function dataFingerprint(source: NonNullable<Source['frozen']>) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        version: 'research-comparison-data-v1',
        evidence: source.evidence.map((entry) => entry.audit.fingerprint).sort(),
        dataCutoffAt: source.dataCutoffAt,
        scope: scopeInputs(source),
        quality: source.quality,
      }),
    )
    .digest('hex');
}
function comparisonGroups(
  before: Source,
  after: Source,
  left: ResearchResultV2,
  right: ResearchResultV2,
) {
  const a = left.inference,
    b = right.inference;
  const oldInput = before.frozen!,
    newInput = after.frozen!;
  const fingerprint = (template: string) => createHash('sha256').update(template).digest('hex');
  const horizons = (value: ResearchResultV2) =>
    value.inference.claims
      .filter((claim) => claim.kind === 'price-direction')
      .map((claim) => ({ instrumentId: claim.instrumentId, tradingDays: claim.tradingDays }));
  return [
    group('opinion', [
      field('conclusion', '结论', a.conclusion, b.conclusion, true),
      field('rationale', '理由', a.rationale, b.rationale, true),
      field('claims', '观点断言的文字与字段', a.claims, b.claims),
      field('numericClaims', '数值断言', a.numericClaims, b.numericClaims),
      field('confidence', '置信度与依据', a.confidence, b.confidence),
      field('risks', '风险', a.risks, b.risks, true),
      field('unknowns', '未知项', a.unknowns, b.unknowns, true),
      field('nextSteps', '下一步', a.nextSteps, b.nextSteps),
    ]),
    group('evidence', [
      field(
        'fingerprints',
        '引用证据指纹',
        [...auditsByFingerprint(left).keys()].sort(),
        [...auditsByFingerprint(right).keys()].sort(),
      ),
    ]),
    group('conditions', [
      field(
        'invalidationConditions',
        '失效条件',
        a.invalidationConditions,
        b.invalidationConditions,
      ),
      field('tradingDays', '断言观察期限', horizons(left), horizons(right)),
    ]),
    group('inputs', [
      field(
        'dataFingerprint',
        '冻结数据资料版本',
        dataFingerprint(oldInput),
        dataFingerprint(newInput),
      ),
      field('dataCutoffAt', '数据截止时间', oldInput.dataCutoffAt, newInput.dataCutoffAt),
      field('quality', '输入质量', oldInput.quality, newInput.quality),
      field('routes', '来源、合同与路由修订', routes(oldInput), routes(newInput)),
      field('scopeSnapshot', '研究范围资料', scopeInputs(oldInput), scopeInputs(newInput)),
    ]),
    group('model', [
      field('promptVersion', 'Prompt 版本', left.promptVersion, right.promptVersion),
      field(
        'promptFingerprint',
        'Prompt 指纹',
        fingerprint(oldInput.prompt.template),
        fingerprint(newInput.prompt.template),
      ),
      field('model', '模型与研究设置修订', left.model, right.model),
    ]),
  ];
}

function unavailableReason(
  input: AiResearchReportComparisonRead,
): ResearchReportComparison['issues'][number] | null {
  const { current, previous } = input;
  if (
    current.detail.historicalScope.status === 'unrecorded' ||
    previous?.detail.historicalScope.status === 'unrecorded'
  )
    return { code: 'legacy_fields_missing', message: '不具备可比资料：历史范围或版本字段未记录' };
  if (!result(current) || !current.frozen || !researchComparisonIdentity(current.detail))
    return { code: 'result_unavailable', message: '报告尚不具备经过核验的冻结比较资料' };
  if (
    previous &&
    (!result(previous) || !previous.frozen || !researchComparisonIdentity(previous.detail))
  )
    return { code: 'result_unavailable', message: '报告尚不具备经过核验的冻结比较资料' };
  if (input.searchStatus === 'completion_unrecorded')
    return { code: 'completion_time_unrecorded', message: '成功完成时间未记录，无法确定默认前序' };
  return null;
}

/** 输入只能来自已核验、分别授权的冻结报告投影；比较不调用执行器或最新数据。 */
export function compareResearchReports(
  input: AiResearchReportComparisonRead,
): ResearchReportComparison {
  const { current, previous } = input;
  const summary = (source: Source) => researchReportSummarySchema.strip().parse(source.detail);
  const output: ResearchReportComparison = {
    version: 'research-comparison-v1',
    selection: input.selection,
    status: 'unavailable',
    current: summary(current),
    previous: previous ? summary(previous) : null,
    frozenFingerprints: {
      before: previous?.frozen?.inputFingerprint ?? null,
      after: current.frozen?.inputFingerprint ?? null,
    },
    issues: [],
    groups: emptyGroups(),
    evidence: [],
  };
  const unavailable = unavailableReason(input);
  if (unavailable) output.issues.push(unavailable);
  else if (!previous) {
    if (input.searchStatus === 'truncated') {
      output.status = 'search_incomplete';
      output.issues.push({
        code: 'search_incomplete',
        message: '前序查找达到上限，请显式选择报告',
      });
    } else {
      output.status = 'no_previous';
      output.issues.push({
        code: 'no_previous',
        message: '尚无同对象、模式、范围和模板的可比前序报告',
      });
    }
  } else {
    const oldIdentity = researchComparisonIdentity(previous.detail)!;
    const newIdentity = researchComparisonIdentity(current.detail)!;
    const dimensions = {
      mode: '账户模式',
      scope: '研究范围类别',
      object: '规范研究对象',
      accounts: '账户范围',
      template: '研究模板或问题',
    } as const;
    for (const [key, label] of Object.entries(dimensions)) {
      const dimension = key as keyof typeof dimensions;
      if (!isEqual(oldIdentity[dimension], newIdentity[dimension]))
        output.issues.push({ code: dimension, message: `${label}不同，不作字段比较` });
    }
    if (output.issues.length) output.status = 'incompatible';
    else {
      output.status = 'compared';
      output.groups = comparisonGroups(previous, current, result(previous)!, result(current)!);
      output.evidence = evidencePairs(result(previous)!, result(current)!);
    }
  }
  return researchReportComparisonSchema.parse(output);
}
