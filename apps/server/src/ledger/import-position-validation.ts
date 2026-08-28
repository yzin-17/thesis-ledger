import { Prisma } from '@prisma/client';

Prisma.Decimal.set({ precision: 40 });

export interface ImportPositionCandidate {
  quantity?: string | undefined;
  costPrice?: string | undefined;
  marketValue?: string | undefined;
  marketPrice?: string | undefined;
  profit?: string | undefined;
  profitRate?: string | undefined;
  confidence?: number | undefined;
}

export const validateImportPositionCandidate = (row: ImportPositionCandidate) => {
  const issues: string[] = [];
  const parseDecimal = (value: string | undefined) => {
    if (value === undefined) return undefined;
    try {
      return new Prisma.Decimal(value);
    } catch {
      return undefined;
    }
  };
  const quantity = parseDecimal(row.quantity);
  const costPrice = parseDecimal(row.costPrice);
  const marketValue = parseDecimal(row.marketValue);
  const marketPrice = parseDecimal(row.marketPrice);
  const profit = parseDecimal(row.profit);
  const profitRate = parseDecimal(row.profitRate);

  if (!quantity || quantity.isNegative()) issues.push('数量缺失或非法');
  if (!costPrice || costPrice.isNegative()) issues.push('成本价缺失或非法');
  if (marketValue && quantity && marketPrice) {
    const expected = quantity.mul(marketPrice);
    if (expected.gt(0) && marketValue.minus(expected).abs().div(expected).gt('0.02'))
      issues.push('市值与数量、市场价不一致');
  }
  if (profit && quantity && costPrice && marketPrice) {
    const expected = quantity.mul(marketPrice.minus(costPrice));
    const tolerance = Prisma.Decimal.max(new Prisma.Decimal('0.01'), expected.abs().mul('0.02'));
    if (profit.minus(expected).abs().gt(tolerance)) issues.push('盈亏与数量、成本价、市场价不一致');
  }
  if (profitRate && costPrice && marketPrice && costPrice.gt(0)) {
    const expected = marketPrice.div(costPrice).minus(1);
    if (profitRate.minus(expected).abs().gt('0.005')) issues.push('盈亏比例不一致');
  }
  if (row.confidence !== undefined && row.confidence < 0.75) issues.push('识别置信度较低');
  return issues;
};
