import { z } from 'zod';
import { generatedStrategyDefinitionV6Schema, generatedSourceDeclarationV6Schema } from './strategy-generation-v6.js';
import { frozenAuthoringField, authoringRequirementCoverageSchema } from './strategy-authoring-operation-schema.js';
import type { AuthoringConfirmation } from './strategy-authoring-confirmation.js';
import type { AuthoringModificationTarget } from './strategy-authoring-modification.js';
import { backtestDailyOrderExecutionSchema } from './backtest-daily-orders.js';

function definitionPresence(
  fields: Record<string, z.ZodType>,
  key: 'description' | 'tradePlan',
  presentFirst = false,
) {
  const { [key]: field, ...absent } = fields;
  if (!(field instanceof z.ZodOptional)) return [fields];
  const present = { ...fields, [key]: field.unwrap() as z.ZodType };
  return presentFirst ? [present, absent] : [absent, present];
}

function linkedV6Proposal(
  fields: Record<string, z.ZodType>,
  ids: string[],
  editingPlan: boolean,
) {
  const variants = ids.length
    ? definitionPresence(fields, 'tradePlan', editingPlan).flatMap((shape) =>
        definitionPresence(shape, 'description'),
      )
    : [fields];
  const [first, second, ...rest] = variants.map((shape) =>
    z.strictObject({
      definition: z.strictObject(shape),
      coverage: authoringRequirementCoverageSchema(ids, Object.keys(shape)),
    }),
  );
  return second ? z.union([first!, second, ...rest]) : first!;
}

export function authoringOperationGenerationV6Schema(input: {
  confirmation?: AuthoringConfirmation | null | undefined;
  baseline?: Record<string, unknown> | undefined;
  target?: Exclude<AuthoringModificationTarget, 'entryOrderValidity'> | undefined;
  requirementIds?: string[] | undefined;
}) {
  const base = generatedStrategyDefinitionV6Schema;
  let fields: Record<string, z.ZodType> = { ...base.shape };
  if (input.baseline && input.target) {
    const { signalSources, ...baseline } = input.baseline;
    fields = Object.fromEntries(Object.entries(baseline).filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, frozenAuthoringField(value)]));
    fields.signalSources = frozenAuthoringField((signalSources as Array<Record<string, unknown>>).map((source) => Object.fromEntries(Object.entries(source).filter(([key]) => key !== 'series'))));
    fields[input.target] = base.shape[input.target];
  } else if (input.confirmation) {
    const c = input.confirmation;
    for (const [key, value] of Object.entries({ executionInstrument: c.instrument, primaryTimeframe: c.timeframe,
      sizing: c.sizing, risk: c.risk, execution: c.execution, cost: c.cost })) fields[key] = frozenAuthoringField(value);
    if (c.execution.timing === 'dailyBarOrders' && !('orders' in c.execution)) fields.execution = backtestDailyOrderExecutionSchema;
    fields.signalSources = z.array(generatedSourceDeclarationV6Schema.extend({
      asset: frozenAuthoringField(c.instrument),
      priceCoordinate: generatedSourceDeclarationV6Schema.shape.priceCoordinate.describe(
        '没有原价要求的指标、会话累计与相对比例用research。只有明确不复权或实际价格规则需要原价才选actual。基金净值用native-nav。',
      ),
    })).max(12);
  }
  const proposal = linkedV6Proposal(fields, input.requirementIds ?? [], input.target === 'tradePlan');
  // 定义先于覆盖与回读。接收仍保留完整原文，编译显式解包。
  return z.strictObject({ proposal, intentCheck: z.string().min(1).max(2000) });
}
