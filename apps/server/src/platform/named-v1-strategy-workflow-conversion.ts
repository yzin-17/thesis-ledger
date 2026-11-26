import {
  authoringContentSchema,
  authoringDefinitionCheck,
  authoringOperationFinishSchema,
  authoringOperationSnapshotSchema,
  backtestRunPreparationTerminalResultV3Schema,
  strategySubmissionInputSchema,
  strategySubmissionReceiptSchema,
} from '@thesis-ledger/schemas';
import { convertLegacyTradeRunConfig } from './named-v1-backtest-conversion.js';
import { convertStrategyDefinition } from './named-v1-strategy-conversion.js';

type Json = Record<string, unknown>;
const record = (raw: unknown): Json | undefined => raw && typeof raw === 'object' && !Array.isArray(raw)
  ? raw as Json : undefined;
const unproven = (reason: string) => ({ outcome: 'unproven' as const, reason });

export function convertSubmittedBacktest(raw: Json) {
  const input = record(raw.input);
  const preparation = record(input?.preparation);
  const prepared = record(raw.prepared);
  const job = record(raw.job);
  const outcome = record(raw.outcome);
  if (raw.kind !== 'ordinary' || raw.state !== 'submitted' || preparation?.contractVersion !== 3 ||
      prepared?.contractVersion !== 3 || !job || !outcome || outcome.id !== job.id ||
      preparation.strategyVersionId !== job.strategyVersionId || preparation.requestId !== prepared.requestId)
    return unproven('回执缺少原始准备或相符的作业引用');

  const convertedInput = strategySubmissionInputSchema.safeParse({
    ...input, preparation: { ...preparation, contractVersion: 1 },
  });
  if (!convertedInput.success) return unproven('原回测准备请求无法按具名合同读回');
  const nextPrepared: Json = { ...prepared, contractVersion: 1 };
  if (prepared.status === 'prepared') {
    const config = record(prepared.runConfig);
    const preflight = record(prepared.executionPreflight);
    if (!config || preflight?.contractVersion !== 3)
      return unproven('回执缺少冻结运行配置或预检');
    const converted = convertLegacyTradeRunConfig(config);
    if ('reason' in converted) return converted;
    nextPrepared.runConfig = converted.runConfig;
    nextPrepared.executionPreflight = { ...preflight, contractVersion: 1 };
  }
  const convertedPrepared = backtestRunPreparationTerminalResultV3Schema.safeParse(nextPrepared);
  if (!convertedPrepared.success)
    return unproven('回测准备回执无法读回：' + convertedPrepared.error.issues
      .map((issue) => issue.path.join('.') || issue.code).join('、'));
  const receipt = strategySubmissionReceiptSchema.safeParse({ ...raw, prepared: convertedPrepared.data });
  if (!receipt.success) return unproven('作业回执身份无法核验');
  return { outcome: 'convert' as const, row: { ...raw, input: convertedInput.data, prepared: convertedPrepared.data } };
}

function convertAuthoringContent(raw: unknown) {
  const content = authoringContentSchema.safeParse(raw);
  if (!content.success) return unproven('草稿内容不符合当前结构');
  if (!content.data.definitionText.trim()) return { content: content.data };
  try {
    const original = JSON.parse(content.data.definitionText) as Json;
    const version = original.schemaVersion === 'strategy-definition-v1' ? 1 : Number(original.schemaVersion);
    const definition = convertStrategyDefinition(version, original);
    if (!('definition' in definition)) return unproven(definition.reason);
    return { content: {
      ...content.data, definitionText: definition.outcome === 'current'
        ? content.data.definitionText : JSON.stringify(definition.definition, null, 2),
    } };
  } catch {
    return unproven('原草稿保留了未完成的编辑文本');
  }
}

export function convertAuthoringRevision(raw: Json) {
  const result = convertAuthoringContent(raw.content);
  if ('reason' in result) return result;
  return { outcome: 'convert' as const, row: { ...raw,
    content: result.content,
    validation: authoringDefinitionCheck(result.content.definitionText),
  } };
}

export function convertAuthoringOperation(raw: Json) {
  const input = record(raw.input);
  const selection = record(input?.selection);
  if (!input || !selection || (raw.status !== 'succeeded' && raw.status !== 'failed'))
    return unproven('编写操作仍待执行或缺少冻结输入');
  const result = convertAuthoringContent(input.content);
  if ('reason' in result) return result;
  const snapshot = authoringOperationSnapshotSchema.safeParse({ ...input, content: result.content });
  if (!snapshot.success || !authoringOperationFinishSchema.safeParse(raw.outcome).success)
    return unproven('操作快照或原始结果审计无法读回');
  // 原始选择摘要、请求用途、模型输出和计费事实仍按原执行记录解释。
  return { outcome: 'convert' as const, row: { ...raw, input: { ...input, content: result.content } } };
}
