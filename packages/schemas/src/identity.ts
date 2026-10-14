import { z } from 'zod';

export const identityCredentialsSchema = z
  .object({
    username: z
      .string()
      .trim()
      .toLowerCase()
      .min(3)
      .max(80)
      .regex(/^[a-z][a-z0-9_.-]+$/u),
    password: z.string().min(12).max(256),
  })
  .strict();
export const identityRegistrationSchema = identityCredentialsSchema
  .extend({
    displayName: z.string().trim().min(1).max(120),
  })
  .strict();
export const identityPrincipalSchema = z
  .object({
    id: z.uuid(),
    username: z.string(),
    displayName: z.string(),
  })
  .strict();
export const identitySessionSchema = z
  .object({
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
    expiresAt: z.iso.datetime(),
    principal: identityPrincipalSchema,
  })
  .strict();
export type IdentityPrincipal = z.infer<typeof identityPrincipalSchema>;

export const identityContextSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('local'), principal: identityPrincipalSchema }).strict(),
  z.object({ mode: z.literal('account'), principal: identityPrincipalSchema.nullable() }).strict(),
]);
