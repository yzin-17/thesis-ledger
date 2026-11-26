import { expect, it } from 'vitest';
import { aiGenerationContracts } from '@thesis-ledger/schemas';
import { probeMessages } from '../../src/ai/provider-connection-test.js';
it('策略发现用途复制真实合同的已验证实例，保留交易计划格式', () => {
  const messages = probeMessages('strategy_discovery', aiGenerationContracts.strategyDiscovery.ref);
  const value = JSON.parse(messages[1]!.content.split('实例：')[1]!);
  const parsed = aiGenerationContracts.strategyDiscovery.schema.parse(value);
  if (!('strategy' in parsed)) throw new Error('资格样例应为可执行策略');
  expect(
    parsed.strategy.tradePlan?.initialStop,
  ).toEqual({ kind: 'percent', percent: '0.05', activation: { kind: 'immediate' } });
});
