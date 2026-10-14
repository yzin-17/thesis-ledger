import { BadRequestException } from '@nestjs/common';
import { isEqual } from 'es-toolkit';
import {
  authoringStrategySchema,
  type AuthoringContent,
  type AuthoringModificationTarget,
} from '@thesis-ledger/schemas';
import { requireAuthoringGeneration, validateAuthoringGeneration } from './authoring-semantics.js';

type Selection = { intent: string; modificationTarget?: AuthoringModificationTarget | undefined };
const reject = (code: string, message: string): never => {
  throw new BadRequestException({ code, message });
};

export function requireAuthoringModification(content: AuthoringContent, selection: Selection) {
  requireAuthoringGeneration(content);
  if (!selection.intent.trim() || !selection.modificationTarget)
    return reject('AUTHORING_MODIFICATION_SCOPE_REQUIRED', '请明确修改内容与唯一规则范围');
  const before = authoringStrategySchema.parse(content.definitionText);
  const target = selection.modificationTarget;
  if (target !== 'risk')
    return { before, target, allowedPaths: [target], riskIndex: null, percent: null };
  const matches = [...selection.intent.matchAll(/(\d+(?:\.\d+)?)\s*[%％]/gu)];
  const riskIndex = before.risk.findIndex((rule) => rule.type === 'fixedStop');
  if (!/止损/u.test(selection.intent) || matches.length !== 1 || riskIndex < 0)
    return reject(
      'AUTHORING_MODIFICATION_AMBIGUOUS',
      '固定止损修改需要已有固定止损及一个明确百分比；其他风险调整请手动编辑',
    );
  const percent = Number(matches[0]![1]) / 100;
  if (!(percent > 0 && percent < 1))
    return reject('AUTHORING_MODIFICATION_AMBIGUOUS', '止损比例必须大于零且小于 100%');
  return { before, target, allowedPaths: [`risk.${riskIndex}`], riskIndex, percent };
}

export function validateAuthoringModification(
  content: AuthoringContent,
  selection: Selection,
  raw: unknown,
) {
  const scope = requireAuthoringModification(content, selection);
  const rawOutput = raw as { definition?: unknown };
  const after = authoringStrategySchema.parse(JSON.stringify(rawOutput?.definition));
  const masked = structuredClone(after);
  if (scope.riskIndex !== null) {
    const rule = after.risk[scope.riskIndex];
    if (
      after.risk.length !== scope.before.risk.length ||
      rule?.type !== 'fixedStop' ||
      Number(rule.percent) !== scope.percent
    )
      return reject('AUTHORING_MODIFICATION_SCOPE_INVALID', '建议必须只调整所确认的固定止损比例');
    masked.risk[scope.riskIndex] = scope.before.risk[scope.riskIndex]!;
  } else Object.assign(masked, { [scope.target]: scope.before[scope.target] });
  if (!isEqual(masked, scope.before))
    return reject('AUTHORING_MODIFICATION_SCOPE_INVALID', '建议改变了授权范围以外的规则');
  if (isEqual(after, scope.before))
    return reject('AUTHORING_MODIFICATION_EMPTY', '建议没有实际变化');
  const confirmation = { ...content.confirmation! };
  if (scope.target === 'risk') confirmation.risk = after.risk;
  else if (scope.target === 'sizing') confirmation.sizing = after.sizing;
  else if (scope.target === 'cost') confirmation.cost = after.cost;
  else if (scope.target === 'entry') confirmation.entrySummary = selection.intent;
  else confirmation.exitSummary = selection.intent;
  const output = validateAuthoringGeneration({ ...content, confirmation }, raw);
  const beforeValue =
    scope.riskIndex === null ? scope.before[scope.target] : scope.before.risk[scope.riskIndex];
  const afterValue = scope.riskIndex === null ? after[scope.target] : after.risk[scope.riskIndex];
  return {
    ...output,
    confirmation,
    allowedPaths: scope.allowedPaths,
    differences: [
      {
        path: scope.allowedPaths[0]!,
        before: JSON.stringify(beforeValue),
        after: JSON.stringify(afterValue),
      },
    ],
  };
}
