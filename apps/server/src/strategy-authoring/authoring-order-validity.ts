import { BadRequestException } from '@nestjs/common';
import { isEqual } from 'es-toolkit';
import {
  authoringOrderValidityChangeSchema,
  type AuthoringContent,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import { generationOrderRoleIssue } from '../ai/ai-generation-order-validation.js';
import { validateAuthoringOutput } from './authoring-semantics.js';

export const orderValiditySystem =
  '根据用户意图和冻结基线判断是否只需更改一张现有建仓单的有效期。' +
  '需要修改时只返回目标 templateId、关联的 requirementId、change 和新 value；仅当天为 DAY，自激活起 N 根为 bars。' +
  '沿用基线中的实际 ID。逐单核对角色与现值，其他规则保持原样。若还需其他改动、目标不明确或没有变化，返回 change=unsupported。只输出符合合同的 JSON。';

export const orderValidityPromptVersion = 'authoring-order-validity-v1';

function reject(message: string): never {
  throw new BadRequestException({ code: 'AUTHORING_MODIFICATION_SCOPE_INVALID', message });
}

export function orderValidityScope(content: AuthoringContent, definition: BacktestStrategy) {
  const requirements = content.requirements.filter((item) => item.state === 'understood');
  if (requirements.length !== 1) return reject('买单有效期修改需要一个已确认需求');
  const { execution } = definition;
  if (execution.timing !== 'dailyBarOrders') return reject('当前策略没有日线委托');
  const confirmed = content.confirmation?.execution;
  if (confirmed?.timing !== execution.timing || ('orders' in confirmed && !isEqual(confirmed, execution)))
    return reject('当前委托与已确认的执行配置不同，请先核对基线');
  for (const [index, order] of execution.orders.entries()) {
    const issue = generationOrderRoleIssue(index, order.action.kind);
    if (issue) return reject(issue);
  }
  if (!isEqual(definition, JSON.parse(content.definitionText)))
    return reject('当前定义需要先审核规范化差异');
  // 完整定义已校验 ID 和角色唯一性，首槽位为建仓单。
  return {
    before: definition,
    target: 'entryOrderValidity' as const,
    order: execution.orders[0]!,
    requirement: requirements[0]!,
  };
}

export function validateOrderValidityChange(
  content: AuthoringContent,
  scope: ReturnType<typeof orderValidityScope>,
  raw: unknown,
) {
  // before 是从修订的 definitionText 新解析出的副本。
  const { before: definition, order, requirement } = scope;
  const change = authoringOrderValidityChangeSchema.parse(raw);
  if (change.change === 'unsupported') return reject('本次意图无法作为一张买单的期限修改');
  if (order.id !== change.templateId || requirement.id !== change.requirementId)
    return reject('目标建仓单或关联需求与当前修订不符');
  if (isEqual(order.validity, change.value))
    throw new BadRequestException({
      code: 'AUTHORING_MODIFICATION_EMPTY',
      message: '建议没有实际变化',
    });
  const path = 'execution.orders.0.validity';
  const difference = {
    path,
    before: JSON.stringify(order.validity),
    after: JSON.stringify(change.value),
  };
  order.validity = change.value;
  const confirmation = { ...content.confirmation!, execution: definition.execution };
  const checked = validateAuthoringOutput(
    { ...content, confirmation },
    {
      definition,
      coverage: [
        {
          requirementId: requirement.id,
          definitionPaths: [...new Set([...requirement.definitionPaths, 'execution'])],
        },
      ],
    },
  );
  return { ...checked, confirmation, allowedPaths: [path], differences: [difference] };
}
