import { z } from 'zod';

export const assetIdentityStatusSchema = z.enum(['provider', 'confirmed']);
export type AssetIdentityStatus = z.infer<typeof assetIdentityStatusSchema>;

export const assetIdentitySourceSchema = z.enum(['catalog', 'manual', 'screenshot']);
export type AssetIdentitySource = z.infer<typeof assetIdentitySourceSchema>;
