import {
  authoringOrderValidityChangeSchema,
  authoringStrategyV6Schema,
  authoringOperationGenerationV6Schema,
} from '@thesis-ledger/schemas';
import { savedAuthoringContract } from './authoring-model-policy.js';
import type { AuthoringOperation } from './authoring-operation.repository.js';
import type { z } from 'zod';
import { materializeEntryPolicy } from '@thesis-ledger/domain';

export function authoringOperationSchema(operation: Pick<AuthoringOperation, 'input'>): z.ZodType {
  const { content, selection } = operation.input;
  if (selection.kind === 'analyze') return savedAuthoringContract(selection).schema;
  const requirementIds = content.requirements
    ?.filter((requirement) => requirement.state === 'understood')
    .map((requirement) => requirement.id);
  if (selection.kind === 'modify') {
    if (selection.modificationTarget === 'entryOrderValidity') return authoringOrderValidityChangeSchema;
    const baseline = materializeEntryPolicy(authoringStrategyV6Schema.parse(content.definitionText));
    return authoringOperationGenerationV6Schema({
      baseline: { ...baseline },
      target: selection.modificationTarget,
      requirementIds,
    });
  }
  return authoringOperationGenerationV6Schema({ confirmation: content.confirmation, requirementIds });
}
