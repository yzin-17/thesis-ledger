import {
  executionModelDisclosureSchema,
  type ExecutionModelDisclosure,
} from '@thesis-ledger/schemas';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatDateOnly, formatDateTime } from '@/lib/date-display';
import type { BacktestJob } from './strategy.types.js';

export function BacktestModelDisclosure({ disclosure }: { disclosure: ExecutionModelDisclosure }) {
  const { model, contentHash } = disclosure;
  const { scope } = model;
  return (
    <Alert>
      <AlertTitle>
        执行模型：{model.id} · {model.version}
      </AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <p>
          {contentHash ? '已冻结的执行模型' : '已选择配置，尚无冻结模型证明'} ·{' '}
          {model.schemaVersion}
        </p>
        <p>
          适用范围：{scope.symbol} · {scope.market} · {scope.instrumentType} · {scope.currency} ·{' '}
          {scope.timezone}；{formatDateOnly(scope.range.start)} 至 {formatDateOnly(scope.range.end)}
        </p>
        {model.segments.map((segment) => (
          <div key={segment.id} className="flex flex-col gap-1">
            <p>
              规则分段：{formatDateOnly(segment.range.start)} 至 {formatDateOnly(segment.range.end)}
            </p>
            <p>
              来源：{sourceLabel(segment.source.kind)} · {segment.source.description} · 来源版本：
              {segment.source.revision}
            </p>
            <p>
              {segment.source.kind === 'historicalFact' ? '声明已知时间' : '配置时间'}：
              {formatDateTime(
                segment.source.kind === 'historicalFact'
                  ? segment.source.knownAt
                  : segment.source.configuredAt,
              )}
            </p>
            <p className="break-all">来源引用：{segment.source.references.join('；')}</p>
            <p>
              简化假设：
              {segment.assumptions.length ? segment.assumptions.join('；') : '未声明简化假设'}
            </p>
          </div>
        ))}
        <p>模型选择与事实支持状态分别校验；Provider 可用性及结果完整度以本次运行返回为准。</p>
        {contentHash && <p className="break-all">模型内容哈希：{contentHash}</p>}
      </AlertDescription>
    </Alert>
  );
}

function sourceLabel(kind: string) {
  if (kind === 'researchPreset') return '研究预设';
  if (kind === 'userConfiguration') return '用户配置';
  return '配置声明的历史事实';
}

export function BacktestRunDisclosure({ job }: { job: BacktestJob }) {
  const result = job.result;
  const parsed = executionModelDisclosureSchema.safeParse(
    result?.executionModelDisclosure ?? job.executionModelDisclosure,
  );
  return (
    <div className="flex flex-col gap-3 pb-4">
      {job.status === 'failed' && (
        <Alert variant="destructive">
          <AlertTitle>回测失败 · {job.errorCode ?? '未提供错误码'}</AlertTitle>
          <AlertDescription>
            <p>{job.errorSummary ?? '服务端未提供具体原因'}</p>
            <p>{diagnosticText(job.diagnostics)}</p>
          </AlertDescription>
        </Alert>
      )}
      {parsed.success ? (
        <BacktestModelDisclosure disclosure={parsed.data} />
      ) : (
        <p className="text-sm text-muted-foreground">
          未提供执行模型披露；旧响应无法确认模型来源与假设。
        </p>
      )}
      {typeof result?.completeness === 'string' && (
        <p className="text-sm">结果完整度：{completenessLabel(result.completeness)}</p>
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
