import 'reflect-metadata';
import { IdentityService } from '../../src/identity/identity.service.js';
import { StrategyAccessService } from '../../src/backtest/strategy-access.service.js';
import { StrategyIdentityGuard } from '../../src/backtest/strategy-identity.guard.js';

// 这些 HTTP 合同测试使用共享策略夹具；权限判定需由独立权限验收覆盖。
// Vitest 的转换不生成构造参数元数据，显式提供守卫依赖。
Reflect.defineMetadata(
  'design:paramtypes',
  [IdentityService, StrategyAccessService],
  StrategyIdentityGuard,
);

export const sharedStrategyHttpProviders = [
  {
    provide: IdentityService,
    useValue: {
      requireSession: async () => {
        throw new Error('共享策略 HTTP 夹具不接受身份令牌');
      },
    },
  },
  {
    provide: StrategyAccessService,
    useValue: {
      strategy: async () => undefined,
      version: async () => undefined,
      run: async () => undefined,
    },
  },
];
