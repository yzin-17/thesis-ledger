import { describe, expect, it } from 'vitest';
import { aiGenerationContracts } from '@thesis-ledger/schemas';
import { authoringConnectionProbe } from '../../src/ai/authoring-connection-probe.js';
import { probeMessages } from '../../src/ai/provider-connection-test.js';

describe('编写用途代表性格式探针', () => {
  it('生成及修改实例满足各自的真实合同及交叉约束', () => {
    for (const contract of [
      aiGenerationContracts.authoringGeneration,
      aiGenerationContracts.authoringModification,
    ]) {
      const example = authoringConnectionProbe(contract.ref.id);
      expect(contract.schema.safeParse(example).success).toBe(true);
      expect(probeMessages(contract.ref.id)[1]!.content).toContain(JSON.stringify(example));
    }
  });
  it('分析用途继续校验用户答案边界，其他用途保持原提示', () => {
    expect(authoringConnectionProbe('strategy_authoring_analysis')).toBeNull();
    expect(authoringConnectionProbe('research')).toBeNull();
    expect(probeMessages('strategy_authoring_analysis')[1]!.content).toContain('answer=null');
    expect(probeMessages('research')[1]!.content).toContain('最小可用实例');
  });
});
