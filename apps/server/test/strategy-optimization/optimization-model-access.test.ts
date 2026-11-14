import { describe, expect, it, vi } from 'vitest';
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { StrategyIdentityGuard } from '../../src/backtest/strategy-identity.guard.js';
import { StrategyOptimizationPreparationController } from '../../src/strategy-optimization/strategy-optimization-preparation.controller.js';

const request = {
  target: { sourceMode: 'existing', strategyVersionId: '11111111-1111-4111-8111-111111111111' },
  startDate: '2024-01-02',
  endDate: '2024-03-29',
  currency: 'CNY',
  adjustment: 'hfq',
};
describe('实验执行设置访问边界', () => {
  it('解析身份，核对嵌套目标的策略归属后再解析设置', async () => {
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        StrategyOptimizationPreparationController.prototype.resolveModel,
      ),
    ).toContain(StrategyIdentityGuard);
    const version = vi.fn().mockResolvedValue(undefined);
    const resolve = vi.fn().mockResolvedValue({ status: 'available' });
    const controller = new StrategyOptimizationPreparationController(
      {} as never,
      { resolve } as never,
      { version } as never,
    );
    await controller.resolveModel(request, 'owner');
    expect(version).toHaveBeenCalledWith(request.target.strategyVersionId, 'owner');
    expect(resolve).toHaveBeenCalledWith(request);
    resolve.mockClear();
    version.mockRejectedValueOnce(new Error('版本不存在或不可访问'));
    await expect(controller.resolveModel(request, 'other-owner')).rejects.toThrow('不可访问');
    expect(resolve).not.toHaveBeenCalled();
  });
});
