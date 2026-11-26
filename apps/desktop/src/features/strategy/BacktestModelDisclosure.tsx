import {
  executionModelDisclosureSchema,
  executionModelDisclosureSchemaV3,
  type ExecutionModelDisclosure,
  type ExecutionModelDisclosureV3,
} from '@thesis-ledger/schemas';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { formatDateOnly, formatDateTime } from '@/lib/date-display';
import { cn } from '@/lib/utils';
import type { BacktestJob } from './strategy.types.js';
import { BacktestLifecyclePreparationDisclosure } from './BacktestLifecyclePreparationDisclosure.js';
import { BacktestPriceDisclosure } from './BacktestPriceDisclosure.js';
import { BacktestPublicFeesDisclosure } from './BacktestPublicFeesDisclosure.js';
import { BacktestTradingStatusDisclosure } from './BacktestTradingStatusDisclosure.js';
import { BacktestBrokerCommissionDisclosure } from './BacktestBrokerCommissionDisclosure.js';
import { BacktestResearchLotSizeDisclosure } from './BacktestResearchLotSizeDisclosure.js';
import { BacktestAssumptionField, BacktestAssumptionSection } from './BacktestAssumptionLayout.js';

const markets: Record<string, string> = { CN: '内地', HK: '香港', US: '美国' };
const instruments: Record<string, string> = {
  STOCK: '股票',
  ETF: 'ETF',
  FUND: '基金',
  INDEX: '指数',
};

export function BacktestModelDisclosure({
  disclosure,
}: {
  disclosure: ExecutionModelDisclosure | ExecutionModelDisclosureV3;
}) {
  const { model, contentHash } = disclosure;
  const { scope } = model;
  return (
    <BacktestAssumptionSection
      title="执行假设"
      status={contentHash ? '已冻结的执行模型' : '尚无冻结证明'}
    >
      <dl className="grid gap-4 sm:grid-cols-2">
        <BacktestAssumptionField label="适用标的">
          {scope.symbol} · {markets[scope.market] ?? scope.market}{' '}
          {instruments[scope.instrumentType] ?? scope.instrumentType} · {scope.currency}
        </BacktestAssumptionField>
        <BacktestAssumptionField label="适用区间">
          {formatDateOnly(scope.range.start)} 至 {formatDateOnly(scope.range.end)}
          <span className="block text-xs text-muted-foreground">{scope.timezone}</span>
        </BacktestAssumptionField>
      </dl>
      {model.segments.map((segment) => (
        <div key={segment.id} className="flex min-w-0 flex-col gap-3">
          <Separator />
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-medium">{sourceLabel(segment.source.kind)}</h4>
            {(model.segments.length > 1 ||
              segment.range.start !== scope.range.start ||
              segment.range.end !== scope.range.end) && (
              <Badge variant="outline">
                {formatDateOnly(segment.range.start)} 至 {formatDateOnly(segment.range.end)}
              </Badge>
            )}
          </div>
          <p className="text-sm">{segment.source.description}</p>
          <ul className="flex list-disc flex-col gap-2 pl-4 text-sm leading-relaxed marker:text-muted-foreground">
            {segment.assumptions.length ? (
              segment.assumptions.map((assumption, index) => <li key={index}>{assumption}</li>)
            ) : (
              <li>未声明简化假设</li>
            )}
          </ul>
          <p className="text-xs text-muted-foreground">
            {segment.source.kind === 'historicalFact' ? '声明已知时间' : '配置时间'}：
            {formatDateTime(
              segment.source.kind === 'historicalFact'
                ? segment.source.knownAt
                : segment.source.configuredAt,
            )}
          </p>
          <p className="break-all text-xs text-muted-foreground">
            来源版本：{segment.source.revision} · 来源引用：{segment.source.references.join('；')}
          </p>
        </div>
      ))}
      <p className="text-xs leading-relaxed text-muted-foreground">
        模型选择与事实支持状态分别校验；提供方可用性及结果完整度以本次运行返回为准。
      </p>
      <BacktestBrokerCommissionDisclosure model={model} />
      <BacktestResearchLotSizeDisclosure model={model} />
    </BacktestAssumptionSection>
  );
}

function sourceLabel(kind: string) {
  if (kind === 'researchPreset') return '研究预设';
  if (kind === 'userConfiguration') return '用户配置';
  return '配置声明的历史事实';
}

export function BacktestRunDisclosure({ job }: { job: BacktestJob }) {
  const result = job.result;
  const isV3 = result && 'schemaVersion' in result && result.schemaVersion === 'backtest-trade-result-v1';
  const parsed = (
    isV3 ? executionModelDisclosureSchemaV3 : executionModelDisclosureSchema
  ).safeParse(result?.executionModelDisclosure ?? job.executionModelDisclosure);
  return (
    <div className="flex flex-col gap-6">
      {typeof result?.completeness === 'string' && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xl font-medium">研究口径与假设</h3>
          <Badge variant="outline">结果完整度：{completenessLabel(result.completeness)}</Badge>
        </div>
      )}
      <BacktestLifecyclePreparationDisclosure config={job.input?.runConfig} />
      {job.status === 'failed' && (
        <Alert variant="destructive">
          <AlertTitle>回测失败 · {job.errorCode ?? '未提供错误码'}</AlertTitle>
          <AlertDescription>
            <p>{job.errorSummary ?? '服务端未提供具体原因'}</p>
            <p>{diagnosticText(job.diagnostics)}</p>
          </AlertDescription>
        </Alert>
      )}
      <div className="flex min-w-0 flex-col gap-6">
        {isV3 && <BacktestPriceDisclosure result={result} />}
        {isV3 && <Separator />}
        {parsed.success ? (
          <BacktestModelDisclosure disclosure={parsed.data} />
        ) : (
          <p className="text-sm text-muted-foreground">
            未提供执行模型披露；旧响应无法确认模型来源与假设。
          </p>
        )}
      </div>
      {isV3 && Boolean(result.publicFeesDisclosure || result.tradingStatusDisclosure) && (
        <section aria-label="费用与交易状态" className="flex min-w-0 flex-col gap-6">
          <Separator />
          <div className="flex flex-col gap-4">
            <h3 className="text-xl font-medium">费用与交易状态</h3>
            <div
              className={cn(
                'grid items-start gap-4',
                Boolean(result.publicFeesDisclosure && result.tradingStatusDisclosure) &&
                  'md:grid-cols-2',
              )}
            >
              <BacktestPublicFeesDisclosure disclosure={result.publicFeesDisclosure} />
              <BacktestTradingStatusDisclosure disclosure={result.tradingStatusDisclosure} />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

export const completenessLabel = (value: unknown) => {
  if (value === 'complete') return '完整';
  if (value === 'partial') return '部分完整';
  if (value === 'unavailable') return '不可用';
  if (value && typeof value === 'object') {
    return (value as { complete?: unknown }).complete === true ? '完整' : '存在缺失数据';
  }
  return '不可用';
};

export const diagnosticText = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const diagnostic = value as { code?: unknown; message?: unknown; path?: unknown };
  return (
    [
      diagnostic.code,
      diagnostic.message,
      Array.isArray(diagnostic.path) ? diagnostic.path.join('.') : null,
    ]
      .filter((part) => typeof part === 'string' && part)
      .join('：') || null
  );
};

export const localizeBacktestMessage = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const message = value.trim();
  if (/invalid parquet magic/iu.test(message)) return '行情文件格式无效。';
  if (/content hash mismatch/iu.test(message)) return '行情文件内容校验和不匹配。';
  if (/no space left on device/iu.test(message)) return '存储空间不足。';
  return message
    .replace(/Artifact not found:/giu, '行情文件缺失：')
    .replace(/Artifact is corrupt/giu, '行情文件损坏')
    .replace(/\bArtifact\b\s*/gu, '行情文件')
    .replace(/\bSnapshot\b/gu, '快照')
    .replace(/\bRun\b/gu, '任务');
};
