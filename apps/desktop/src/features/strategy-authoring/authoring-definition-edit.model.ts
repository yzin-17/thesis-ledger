import { isEqual } from 'es-toolkit';
import { authoringStrategySchema, type AuthoringContent } from '@thesis-ledger/schemas';

export function editAuthoringDefinition(
  content: AuthoringContent,
  definitionText: string,
): AuthoringContent {
  const previous = authoringStrategySchema.safeParse(content.definitionText);
  const next = authoringStrategySchema.safeParse(definitionText);
  if (previous.success && next.success && isEqual(previous.data, next.data))
    return { ...content, definitionText };
  return {
    ...content,
    definitionText,
    confirmation: null,
    requirements: content.requirements.map((requirement) =>
      requirement.state === 'understood' ? { ...requirement, state: 'unresolved' } : requirement,
    ),
    manualChanges: [...new Set([...content.manualChanges, '用户手动编辑策略定义'])],
  };
}
