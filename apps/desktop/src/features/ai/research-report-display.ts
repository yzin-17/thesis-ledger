import type {
  ResearchReportSummary,
  ResearchReportDetail,
  AiResearchPrimaryStatus,
  AiResearchResultAvailability,
  ResearchScopeSnapshotV2,
  ResearchReportLocatorInput,
} from '@thesis-ledger/schemas';
import type { AiRunRecord } from './ai.types.js';
export function reportEvidenceLocator(
  snapshot: ResearchScopeSnapshotV2,
): ResearchReportLocatorInput {
  const mode = snapshot.mode;
  if (snapshot.scope === 'instrument')
    return {
      view: 'scoped',
      mode,
      scope: 'instrument',
      instrumentId: snapshot.instrument.instrumentId,
    };
  if (snapshot.scope === 'position')
    return {
      view: 'scoped',
      mode,
      scope: 'position',
      accountId: snapshot.accountId,
      symbol: snapshot.instrument.symbol,
    };
  if (snapshot.scope === 'account')
    return { view: 'scoped', mode, scope: 'account', accountId: snapshot.accountId };
  if (snapshot.scope === 'strategy')
    return {
      view: 'scoped',
      mode,
      scope: 'strategy',
      strategyVersionId: snapshot.strategyVersionId,
    };
  return {
    view: 'scoped',
    mode,
    scope: 'portfolio',
    ...(snapshot.portfolioId ? { portfolioId: snapshot.portfolioId } : {}),
  };
}

const scopeLabels = {
  instrument: '标的研究',
  portfolio: '组合研究',
  account: '账户研究',
  position: '持仓研究',
  strategy: '策略研究',
} as const;
function primaryStatus(report: ResearchReportSummary): AiResearchPrimaryStatus {
  if (
    report.status === 'queued' ||
    report.status === 'running' ||
    report.status === 'failed' ||
    report.status === 'cancelled'
  )
    return report.status;
  if (report.availability === 'pending_verification') return 'pending_verification';
  if (report.availability !== 'available') return 'result_unavailable';
  return report.quality?.status === 'partial' ? 'result_gap' : 'completed';
}
function availability(report: ResearchReportSummary): AiResearchResultAvailability {
  if (report.availability === 'pending') return 'missing';
  if (report.availability === 'available' && report.quality?.status === 'partial') return 'gap';
  return report.availability;
}
/** 页面保留原列表/阅读壳；只转换展示字段，不补造历史上下文或计量。 */
function reportObjects(report: ResearchReportSummary) {
  const historical = report.historicalScope;
  let object: NonNullable<AiRunRecord['display']>['object'] = {
    type: 'unknown',
    label: '历史范围未记录',
  };
  let source: NonNullable<AiRunRecord['display']>['source'] = {
    type: 'unknown',
    label: '历史报告',
  };
  if (historical.status === 'known') {
    const scope = historical.snapshot;
    object = {
      type: scope.scope === 'strategy' ? 'strategy_version' : scope.scope,
      label: scopeLabels[scope.scope],
    };
    if (scope.scope === 'instrument' || scope.scope === 'position')
      object.code = scope.instrument.symbol;
    else if (scope.scope === 'account') object.code = scope.accountId.slice(0, 8);
    else if (scope.scope === 'strategy') object.code = scope.strategyVersionId.slice(0, 8);
    else if (scope.scope === 'portfolio') object.code = scope.portfolioId?.slice(0, 8) ?? '全组合';
    source = {
      type: scope.scope,
      label: `${scope.mode === 'shadow' ? '模拟' : '实际'} · ${scopeLabels[scope.scope]}`,
    };
  }
  return { object, source };
}
export function reportToAiRun(report: ResearchReportSummary | ResearchReportDetail): AiRunRecord {
  const historical = report.historicalScope;
  const { object, source } = reportObjects(report);
  const detail = 'result' in report ? report : null;
  const result = detail?.result;
  let verificationReason: string | null = null;
  if (report.availability === 'pending_verification') verificationReason = '历史引用归属尚待核验';
  else if (['invalid', 'unsupported'].includes(report.availability))
    verificationReason = '保存的产物无法核验，正文和引用不可用';
  return {
    id: report.id,
    provider: result?.version === 2 ? result.model.providerId : (result?.provider ?? '未记录'),
    model: result?.version === 2 ? result.model.modelId : '未记录',
    promptVersion: result?.version === 2 ? result.promptVersion : '未记录',
    status: report.status,
    question: report.question,
    context: null,
    result: result?.version === 1 ? result : null,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    errorCode: report.errorCode,
    errorSummary: report.errorSummary,
    ...(detail ? { savedReport: detail } : {}),
    display: {
      id: report.id,
      question: report.question,
      taskKind: 'research',
      object,
      source,
      executionStatus: report.status,
      primaryStatus: primaryStatus(report),
      resultAvailability: availability(report),
      summary: report.summary,
      verificationReason,
      dataVersion: report.updatedAt,
      updatedAt: report.updatedAt,
      capabilities: {
        canRead: true,
        canReload: true,
        canRetry: report.status === 'failed',
        canCancel: historical.status === 'known' && ['queued', 'running'].includes(report.status),
        canOpenSource: false,
      },
    },
  };
}

const qualityReasons: Record<string, string> = {
  quote_policy_revision_unrecorded: '报价策略修订未记录',
  quote_route_revision_unrecorded: '报价路由修订未记录',
  fund_nav_publication_time_unrecorded: '基金净值的发布时间未记录，净值日期单独展示',
  fund_nav_route_revision_unrecorded: '基金净值路由修订未记录',
  news_published_time_unrecorded: '部分新闻发布时间未记录',
  news_source_available_time_unrecorded: '新闻来源可用时间未记录',
  news_not_admitted: '新闻来源尚不可用',
  news_unavailable: '本次新闻资料不可用',
  private_cash_projection_unknown: '现金数据与账本的对应状态未知',
  private_cash_projection_stale: '现金数据尚未更新到当前账本状态',
  private_currency_unknown: '部分私有数据的币种未记录',
  private_instruments_unresolved: '部分持仓尚未关联规范证券',
};
export const researchQualityReason = (code: string) =>
  qualityReasons[code] ?? '部分资料或来源信息尚不完整，请核对证据与未知项。';
export const researchQualityReasonDetail = (code: string) =>
  qualityReasons[code] ?? `未分类限制：${code}`;
