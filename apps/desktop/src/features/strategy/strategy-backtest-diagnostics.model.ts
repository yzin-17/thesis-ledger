import type { BacktestJob, BacktestJobResult } from './strategy.types.js';

export const BACKTEST_DIAGNOSTIC_FORMAT = 'thesis-ledger.backtest-diagnostics';
export const BACKTEST_DIAGNOSTIC_FORMAT_VERSION = 1;

type DiagnosticScalar = string | number | boolean | null;
type DiagnosticRecord = Record<string, DiagnosticScalar>;

export type BacktestDiagnosticExport = {
  format: typeof BACKTEST_DIAGNOSTIC_FORMAT;
  formatVersion: typeof BACKTEST_DIAGNOSTIC_FORMAT_VERSION;
  exportedAt: string;
  identity: {
    jobId: DiagnosticScalar;
    runId: DiagnosticScalar;
    strategyVersionId: DiagnosticScalar;
    mode: DiagnosticScalar;
    status: DiagnosticScalar;
    stage: DiagnosticScalar;
    createdAt: DiagnosticScalar;
    startedAt: DiagnosticScalar;
    finishedAt: DiagnosticScalar;
    period: { start: string | null; end: string | null };
  };
  frozenConfiguration: {
    dataAsOf: string | null;
    baseCurrency: string | null;
    initialCash: DiagnosticRecord;
    valuationPolicy: DiagnosticRecord;
    executionModel: DiagnosticRecord;
  };
  outcome: {
    completeness: DiagnosticScalar;
    warnings: string[];
    metrics: Record<string, DiagnosticRecord>;
    failure: DiagnosticRecord;
  };
  traceability: DiagnosticRecord;
  reproduction: {
    artifactMode: 'references-only';
    dependencyAccess: 'unverified';
    requiredArtifacts: string[];
    note: string;
  };
};

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const field = (source: Record<string, unknown> | null, key: string) =>
  source ? source[key] : undefined;

const firstPresent = (...values: unknown[]) =>
  values.find((value) => value !== null && value !== undefined);

const scalar = (value: unknown): DiagnosticScalar => {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return null;
};

const sensitiveKey = (value: string) =>
  /(?:api[-_]?key|access[-_]?token|auth(?:orization)?|cookie|credential|password|secret|session|signature|x-amz-credential)/iu.test(
    value,
  );

const redactCredentialUrls = (value: string) =>
  value.replace(/https?:\/\/[^\s<>'"]+/giu, (candidate) => {
    try {
      const url = new URL(candidate);
      const hasSensitiveQuery = [...url.searchParams.keys()].some(sensitiveKey);
      if (url.username || url.password || hasSensitiveQuery) return '[已移除带凭证的 URL]';
      return candidate;
    } catch {
      return '[已移除无法安全解析的 URL]';
    }
  });

const stripUnsafeControlCharacters = (value: string) =>
  [...value]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return character === '\n' || character === '\t' || (code >= 32 && code !== 127);
    })
    .join('');

export const sanitizeBacktestDiagnosticText = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const normalized = stripUnsafeControlCharacters(value.replace(/\r\n?/gu, '\n'));
  return redactCredentialUrls(normalized)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/giu, 'Bearer [已脱敏]')
    .replace(
      /\b(api[-_]?key|access[-_]?token|authorization|cookie|credential|password|secret|session|signature)\b\s*[:=]\s*[^\s,;]+/giu,
      '$1=[已脱敏]',
    );
};

const safeScalar = (value: unknown): DiagnosticScalar => {
  const plain = scalar(value);
  return typeof plain === 'string' ? sanitizeBacktestDiagnosticText(plain) : plain;
};

const safeString = (value: unknown) => {
  const result = safeScalar(value);
  return typeof result === 'string' ? result : null;
};

const currencyAmounts = (value: unknown): DiagnosticRecord => {
  const source = record(value);
  return {
    recordedAmount: source ? null : safeScalar(value),
    CNY: safeScalar(source?.CNY),
    HKD: safeScalar(source?.HKD),
    USD: safeScalar(source?.USD),
  };
};

const metricExport = (value: unknown): DiagnosticRecord => {
  const source = record(value);
  if (!source) return { status: value === null || value === undefined ? null : 'available', value: safeScalar(value), reason: null, code: null };
  return {
    status: safeScalar(source.status),
    value: safeScalar(source.value),
    reason: safeScalar(source.reason),
    code: safeScalar(source.code),
  };
};

const metricsExport = (value: unknown) => {
  const source = record(value);
  if (!source) return {};
  return Object.fromEntries(
    Object.entries(source)
      .filter(([key]) => !sensitiveKey(key))
      .map(([key, metric]) => [key, metricExport(metric)]),
  );
};

const warningExport = (value: unknown) => {
  let values: unknown[] = [];
  if (Array.isArray(value)) values = value;
  else if (value !== null && value !== undefined) values = [value];
  return values.flatMap((item) => {
    const sanitized = sanitizeBacktestDiagnosticText(item);
    return sanitized ? [sanitized] : [];
  });
};

const executionModelExport = (
  job: BacktestJob,
  result: BacktestJobResult,
  runConfig: Record<string, unknown> | null,
): DiagnosticRecord => {
  const disclosure =
    record(result.executionModelDisclosure) ?? record(job.executionModelDisclosure);
  const model = record(firstPresent(field(disclosure, 'model'), field(runConfig, 'executionModel')));
  const scope = record(field(model, 'scope'));
  const range = record(field(scope, 'range'));
  const segments = field(model, 'segments');
  return {
    schemaVersion: safeScalar(field(model, 'schemaVersion')),
    id: safeScalar(field(model, 'id')),
    version: safeScalar(field(model, 'version')),
    symbol: safeScalar(field(scope, 'symbol')),
    market: safeScalar(field(scope, 'market')),
    instrumentType: safeScalar(field(scope, 'instrumentType')),
    currency: safeScalar(field(scope, 'currency')),
    timezone: safeScalar(field(scope, 'timezone')),
    rangeStart: safeScalar(field(range, 'start')),
    rangeEnd: safeScalar(field(range, 'end')),
    segmentCount: Array.isArray(segments) ? segments.length : null,
    contentHash: safeScalar(field(disclosure, 'contentHash')),
  };
};

const identityExport = (
  job: BacktestJob,
  result: BacktestJobResult,
): BacktestDiagnosticExport['identity'] => ({
  jobId: safeScalar(job.id),
  runId: safeScalar(result.runId),
  strategyVersionId: safeScalar(firstPresent(result.strategyVersionId, job.strategyVersionId)),
  mode: safeScalar(job.mode),
  status: safeScalar(job.status),
  stage: safeScalar(job.stage),
  createdAt: safeScalar(job.createdAt),
  startedAt: safeScalar(job.startedAt),
  finishedAt: safeScalar(job.finishedAt),
  period: {
    start: safeString(firstPresent(job.period?.start, job.periodStart)),
    end: safeString(firstPresent(job.period?.end, job.periodEnd)),
  },
});

const configurationExport = (
  job: BacktestJob,
  result: BacktestJobResult,
  input: Record<string, unknown> | null,
  runConfig: Record<string, unknown> | null,
): BacktestDiagnosticExport['frozenConfiguration'] => {
  const valuationPolicy = record(field(runConfig, 'valuationPolicy'));
  const metadata = record(result.metadata);
  return {
    dataAsOf: safeString(
      firstPresent(field(runConfig, 'dataAsOf'), result.dataAsOf, job.dataAsOf),
    ),
    baseCurrency: safeString(
      firstPresent(
        field(runConfig, 'baseCurrency'),
        field(input, 'baseCurrency'),
        field(metadata, 'baseCurrency'),
      ),
    ),
    initialCash: currencyAmounts(
      firstPresent(field(runConfig, 'initialCash'), field(input, 'initialCash'), job.initialCash),
    ),
    valuationPolicy: { missingPrice: safeScalar(field(valuationPolicy, 'missingPrice')) },
    executionModel: executionModelExport(job, result, runConfig),
  };
};

const outcomeExport = (
  job: BacktestJob,
  result: BacktestJobResult,
): BacktestDiagnosticExport['outcome'] => ({
  completeness: safeScalar(result.completeness),
  warnings: warningExport(firstPresent(result.warnings, job.warnings)),
  metrics: metricsExport(result.metrics),
  failure: {
    code: safeScalar(job.errorCode),
    summary: safeScalar(job.errorSummary),
  },
});

const traceabilityExport = (
  job: BacktestJob,
  result: BacktestJobResult,
): BacktestDiagnosticExport['traceability'] => {
  const resultDisclosure = record(result.executionModelDisclosure);
  const jobDisclosure = record(job.executionModelDisclosure);
  return {
    engineVersion: safeScalar(firstPresent(result.engineVersion, job.engineVersion)),
    snapshotId: safeScalar(firstPresent(result.snapshotId, job.snapshotId)),
    contentHash: safeScalar(result.contentHash),
    resultChecksum: safeScalar(firstPresent(result.resultChecksum, job.resultChecksum)),
    executionModelHash: safeScalar(
      firstPresent(field(resultDisclosure, 'contentHash'), field(jobDisclosure, 'contentHash')),
    ),
    marketRuleVersion: safeScalar(result.marketRuleVersion),
    calendarVersion: safeScalar(result.calendarVersion),
    aggregationVersion: safeScalar(result.aggregationVersion),
  };
};

export const buildBacktestDiagnosticExport = (
  job: BacktestJob,
  result: BacktestJobResult,
  exportedAt = new Date(),
): BacktestDiagnosticExport => {
  const input = record(job.input);
  const runConfig = record(field(input, 'runConfig'));
  return {
    format: BACKTEST_DIAGNOSTIC_FORMAT,
    formatVersion: BACKTEST_DIAGNOSTIC_FORMAT_VERSION,
    exportedAt: exportedAt.toISOString(),
    identity: identityExport(job, result),
    frozenConfiguration: configurationExport(job, result, input, runConfig),
    outcome: outcomeExport(job, result),
    traceability: traceabilityExport(job, result),
    reproduction: {
      artifactMode: 'references-only',
      dependencyAccess: 'unverified',
      requiredArtifacts: ['策略版本定义', '数据快照', '执行模型', '回测引擎版本'],
      note: '此文件只包含诊断字段和产物引用，不包含原始数据快照；依赖可访问性尚未验证，不能视为完整复现包。',
    },
  };
};

const summaryLine = (label: string, value: unknown) => {
  if (value === null || value === undefined || value === '') return `${label}：未记录`;
  if (typeof value === 'object') return `${label}：${JSON.stringify(value)}`;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return `${label}：${String(value)}`;
  }
  return `${label}：未记录`;
};

export const buildBacktestDiagnosticSummary = (payload: BacktestDiagnosticExport) =>
  [
    `回测诊断摘要（格式 v${payload.formatVersion}）`,
    summaryLine('任务 ID', payload.identity.jobId),
    summaryLine('策略版本 ID', payload.identity.strategyVersionId),
    summaryLine('运行 ID', payload.identity.runId),
    summaryLine('任务状态', payload.identity.status),
    summaryLine('请求区间', payload.identity.period),
    summaryLine('数据冻结时点', payload.frozenConfiguration.dataAsOf),
    summaryLine('执行模型', payload.frozenConfiguration.executionModel),
    summaryLine('结果完整性', payload.outcome.completeness),
    summaryLine('引擎版本', payload.traceability.engineVersion),
    summaryLine('数据快照 ID', payload.traceability.snapshotId),
    summaryLine('内容哈希', payload.traceability.contentHash),
    summaryLine('结果校验和', payload.traceability.resultChecksum),
    `复现边界：${payload.reproduction.note}`,
  ].join('\n');
