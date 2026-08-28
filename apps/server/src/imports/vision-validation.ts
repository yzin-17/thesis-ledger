import { decimalStringSchema } from '@thesis-ledger/schemas';
import { z } from 'zod';
import { validateImportPositionCandidate } from '../ledger/import-position-validation.js';
import type { ScreenshotSource } from './screenshot-source.js';

export { inferAssetType } from '../ledger/asset-type.js';

export interface VisionPosition {
  symbol?: string | undefined;
  name?: string | undefined;
  quantity?: string | undefined;
  costPrice?: string | undefined;
  marketValue?: string | undefined;
  marketPrice?: string | undefined;
  profit?: string | undefined;
  profitRate?: string | undefined;
  confidence: number;
  rawText?: Record<string, string> | undefined;
}

export interface PositionVisionProvider {
  readonly id: string;
  extract(image: Uint8Array, source: ScreenshotSource): Promise<VisionPosition[]>;
}

export const visionPositionSchema = z.object({
  symbol: z.string().optional(),
  name: z.string().optional(),
  quantity: decimalStringSchema.optional(),
  costPrice: decimalStringSchema.optional(),
  marketValue: decimalStringSchema.optional(),
  marketPrice: decimalStringSchema.optional(),
  profit: decimalStringSchema.optional(),
  profitRate: decimalStringSchema.optional(),
  confidence: z.number().finite().min(0).max(1),
  rawText: z.record(z.string(), z.string()).optional(),
});

export const validateVisionPosition = (row: VisionPosition) => validateImportPositionCandidate(row);
