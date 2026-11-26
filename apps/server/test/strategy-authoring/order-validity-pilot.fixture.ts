import type { z } from 'zod';
import {
  aiGenerationContracts,
  authoringOrderValidityChangeSchema as validityPilotSchema,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import { generationOutput } from '../../src/ai/ai-generation-output.js';
import { generationOrderSlotError } from '../../src/ai/ai-generation-order-validation.js';
import { authoringOperationSchema } from '../../src/strategy-authoring/authoring-operation-schema.js';
import type { AuthoringOperation } from '../../src/strategy-authoring/authoring-operation.repository.js';
import {
  requireAuthoringModification,
  validateAuthoringModification,
} from '../../src/strategy-authoring/authoring-modification.js';

export type PilotOperation = Pick<AuthoringOperation, 'input' | 'revision'>;

export { orderValiditySystem as validityPilotSystem } from '../../src/strategy-authoring/authoring-order-validity.js';
export { validityPilotSchema };

// 仅在测试内组装待审核提案。操作快照及短响应是唯一业务输入。
export async function prepareValidityPilot(
  operation: PilotOperation,
  currentRevision: number,
  raw: unknown,
) {
  const { content, selection } = operation.input;
  if (currentRevision !== operation.revision || selection.expectedRevision !== operation.revision)
    throw Error('草稿修订已过期');
  if (selection.kind !== 'modify' || selection.modificationTarget !== 'execution')
    throw Error('不属于委托修改范围');
  const change = validityPilotSchema.parse(raw);
  if (change.change === 'unsupported') return null;
  const requirements = content.requirements?.filter((item) => item.state === 'understood');
  if (requirements?.length !== 1 || requirements[0]?.id !== change.requirementId)
    throw Error('试点只处理一个已确认需求');

  const { before } = requireAuthoringModification(content, selection);
  const definition = structuredClone(before) as BacktestStrategy;
  if (definition.execution.timing !== 'dailyBarOrders') throw Error('需要日线委托');
  const orders = definition.execution.orders;
  const index = orders.findIndex((item) => item.id === change.templateId);
  const order = orders[index];
  if (!order || order.action.kind !== 'entry') throw Error('找不到目标建仓单');
  order.validity = change.value;

  const path = `execution.orders.${index}.validity`;
  const proposal = {
    definition,
    coverage: [
      {
        requirementId: change.requirementId,
        definitionPaths: [...new Set([...requirements[0].definitionPaths, 'execution'])],
      },
    ],
  };
  const format = await generationOutput(
    'native_schema',
    authoringOperationSchema(operation),
    aiGenerationContracts.authoringModification.ref,
  ).responseFormat;
  if (format?.type !== 'json' || !format.schema) throw Error('缺少原生操作合同');
  const slotError = generationOrderSlotError(format.schema as z.core.JSONSchema.BaseSchema, {
    proposal,
  });
  if (slotError) throw slotError;
  const checked = validateAuthoringModification(content, selection, proposal);
  return { checked, templateId: order.id, path };
}
