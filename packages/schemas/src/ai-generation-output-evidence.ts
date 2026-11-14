import { z } from 'zod';

const count = z.number().int().nonnegative().nullable();
const digest = z
  .string()
  .regex(/^[a-f0-9]{64}$/u)
  .nullable();

export const aiReasoningOutputDiagnosticSchema = z.strictObject({
  characters: count,
  sha256: digest,
  repetition: z
    .strictObject({
      sampledCharacters: z.number().int().nonnegative().max(65536),
      truncated: z.boolean(),
      maxLineOccurrences: z.number().int().nonnegative(),
      maxParagraphOccurrences: z.number().int().nonnegative(),
    })
    .nullable(),
});

export const aiOutputTokenDetailsSchema = z.strictObject({
  textTokens: count,
  reasoningTokens: count,
});
