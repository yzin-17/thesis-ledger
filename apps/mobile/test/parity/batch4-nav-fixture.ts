import {
  backtestNavPreparationRequestV3Schema,
  backtestNavPreparationResultV3Schema,
  backtestNavResultV3Schema,
  strategySchema,
} from '@thesis-ledger/schemas';
import sample from './batch4-nav.fixture.json';

/** 第 4 批手机合同的合成响应；不执行 Server 准备算法或访问真实数据。 */
export const b4NavFixture = () => ({
  navDefinition: strategySchema.parse(sample.navDefinition),
  navRequest: backtestNavPreparationRequestV3Schema.parse(sample.navRequest),
  navPrepared: backtestNavPreparationResultV3Schema.parse(sample.navPrepared),
  navResult: backtestNavResultV3Schema.parse(sample.navResult),
});
