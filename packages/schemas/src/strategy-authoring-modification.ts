import { z } from 'zod';

export const authoringModificationTargetSchema = z.enum([
  'entry',
  'exit',
  'sizing',
  'risk',
  'cost',
]);
export type AuthoringModificationTarget = z.infer<typeof authoringModificationTargetSchema>;
