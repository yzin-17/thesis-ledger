import { describe, expect, it, vi } from 'vitest';
import { RiskRuleService } from '../../src/risk/risk-rule.service.js';
import { RiskContextService } from '../../src/risk/risk-context.service.js';
import { displayPrisma } from '../instrument-display.fixture.js';

describe('风险名称目录读取', () => {
  it('规则列表批量使用目录名，不依赖 Asset，也保留无标的规则', async () => {
    const rules = [{ symbol: '000001.OF' }, { symbol: '000001.OF' }, { symbol: null }];
    const prisma = { ...displayPrisma(), riskRule: { findMany: vi.fn(async () => rules) } };
    const result = await new RiskRuleService(prisma as never).listRules();
    expect(result.map((row) => row.assetName)).toEqual(['华夏成长混合', '华夏成长混合', null]);
    expect(prisma.instrument.findMany).toHaveBeenCalledTimes(1);
    expect(rules[0]).not.toHaveProperty('assetName');
  });

  it('当前上下文目录名覆盖传入旧名，未知标的回退代码，不改原始上下文', async () => {
    const prisma = displayPrisma();
    const scan = ['000001.OF', '999999.OF'].map((symbol) => ({
      symbol,
      assetName: '旧输入名称',
      price: 1.22,
      marketTime: '2026-11-04T00:00:00Z',
      dataQuality: {},
    }));
    const result = await new RiskContextService(prisma as never).prepare(scan, false);
    expect(result.security.map((row) => row.assetName)).toEqual(['华夏成长混合', '999999.OF']);
    expect(scan[0]?.assetName).toBe('旧输入名称');
    expect(prisma.instrument.findMany).toHaveBeenCalledTimes(1);
  });
});
