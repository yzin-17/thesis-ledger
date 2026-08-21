import type { ScreenshotSource } from './screenshot-source.js';

export interface VisionPosition {
  symbol?: string;
  name?: string;
  quantity?: number;
  costPrice?: number;
  marketValue?: number;
  marketPrice?: number;
  profit?: number;
  profitRate?: number;
  confidence: number;
  rawText?: Record<string, string>;
}

export interface PositionVisionProvider {
  readonly id: string;
  extract(image: Uint8Array, source: ScreenshotSource): Promise<VisionPosition[]>;
}

export const inferAssetType = (symbol?: string, explicit?: string) => {
  if (explicit) return explicit;
  if (!symbol) return undefined;
  if (symbol.endsWith('.OF')) return 'fund';
  return /^[15]\d{5}\.(SH|SZ|BJ)$/.test(symbol) ? 'etf' : 'stock';
};

export const validateVisionPosition = (row: VisionPosition) => {
  const issues: string[] = [];
  if (row.quantity === undefined || row.quantity < 0) issues.push('数量缺失或非法');
  if (row.costPrice === undefined || row.costPrice < 0) issues.push('成本价缺失或非法');
  if (
    row.marketValue !== undefined &&
    row.quantity !== undefined &&
    row.marketPrice !== undefined
  ) {
    const expected = row.quantity * row.marketPrice;
    if (expected > 0 && Math.abs(row.marketValue - expected) / expected > 0.02)
      issues.push('市值与数量、市场价不一致');
  }
  if (
    row.profit !== undefined &&
    row.quantity !== undefined &&
    row.costPrice !== undefined &&
    row.marketPrice !== undefined
  ) {
    const expected = row.quantity * (row.marketPrice - row.costPrice);
    if (Math.abs(row.profit - expected) > Math.max(0.01, Math.abs(expected) * 0.02))
      issues.push('盈亏与数量、成本价、市场价不一致');
  }
  if (
    row.profitRate !== undefined &&
    row.costPrice !== undefined &&
    row.marketPrice !== undefined &&
    row.costPrice > 0
  ) {
    const expected = row.marketPrice / row.costPrice - 1;
    if (Math.abs(row.profitRate - expected) > 0.005) issues.push('盈亏比例不一致');
  }
  if (row.confidence < 0.75) issues.push('识别置信度较低');
  return issues;
};
