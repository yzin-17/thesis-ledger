import { buildGenerationSchemaPrompt } from '../ai/ai-generation-schema-prompt.js';
import type { AuthoringOperation } from './authoring-operation.repository.js';
import { authoringMessagesV6 } from './authoring-prompt-v6.js';
import { authoringAnalysisMessages } from './authoring-analysis-prompt.js';
import { authoringOperationSchema } from './authoring-operation-schema.js';
import { orderValiditySystem } from './authoring-order-validity.js';

export const AUTHORING_PROMPT_VERSION = 'strategy-authoring-prompt-v1';

export function authoringMessages(operation: AuthoringOperation) {
  const { content, selection } = operation.input;
  if (selection.kind === 'analyze')
    return authoringAnalysisMessages(operation, authoringOperationSchema(operation));
  if (selection.kind !== 'modify' || selection.modificationTarget !== 'entryOrderValidity')
    return authoringMessagesV6(operation);
  return [
    {
      role: 'system',
      content: orderValiditySystem + buildGenerationSchemaPrompt(authoringOperationSchema(operation), 'ref'),
    },
    {
      role: 'user',
      content: JSON.stringify({
        revision: operation.revision,
        modificationTarget: 'execution',
        baseline: JSON.parse(content.definitionText) as unknown,
        requirementIds: content.requirements.filter((item) => item.state === 'understood').map((item) => item.id),
        intent: selection.intent,
      }),
    },
  ];
}
