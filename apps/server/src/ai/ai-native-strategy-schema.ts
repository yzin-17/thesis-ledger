import { jsonSchema } from 'ai';
import { z } from 'zod';
import {
  aiGenerationContracts,
  authoringOrderValidityChangeSchema,
  type AiGenerationContractRef,
} from '@thesis-ledger/schemas';
import { directSchemaReferences, generationJsonSchema } from './ai-generation-json-schema.js';
import { compactGenerationSchema } from './ai-generation-schema-references.js';
import { generationOrderSlotError } from './ai-generation-order-validation.js';

export function nativeStrategySchema<OUTPUT>(
  schema: z.ZodType<OUTPUT>,
  contract?: AiGenerationContractRef,
) {
  const contracts: readonly { schema: z.ZodType; ref: AiGenerationContractRef }[] = [
    aiGenerationContracts.strategyDiscovery,
    aiGenerationContracts.authoringGeneration,
    aiGenerationContracts.authoringModification,
  ];
  if (
    !contracts.some(
      (entry) =>
        entry.schema === schema ||
        (entry.ref.id === contract?.id && entry.ref.version === contract.version),
    )
  )
    return schema;
  const projected = Object.is(schema, authoringOrderValidityChangeSchema)
    ? z.toJSONSchema(schema, { target: 'draft-7', io: 'input' })
    : compactGenerationSchema(
        directSchemaReferences(generationJsonSchema(schema, 'draft-7', 'ref', 'input')),
      );
  return jsonSchema<OUTPUT>(projected as Parameters<typeof jsonSchema>[0], {
    validate: (value) => {
      const parsed = schema.safeParse(value);
      if (!parsed.success) return { success: false, error: parsed.error };
      const error = generationOrderSlotError(projected as z.core.JSONSchema.BaseSchema, value);
      return error ? { success: false, error } : { success: true, value: parsed.data };
    },
  });
}
