import { describe, expect, it } from 'vitest';
import {
  projectAiProviderStatus,
  aiProviderConnectionLabel,
  type AiProviderStatusRoute,
} from '../src/ai-provider-status.js';

const route = (reasons: string[], purpose = 'arena_decision'): AiProviderStatusRoute => ({
  model: 'model-a',
  contract: { id: purpose, version: `${purpose}-v2` },
  readiness: { state: reasons.length ? 'blocked' : 'ready', reasons },
  liveValidation: { status: 'passed' },
});

describe('提供方状态展示', () => {
  it('仅缺任务费用授权时不当作配置故障，保留服务端原始状态', () => {
    const input = [route(['budget_not_authorized'])];
    const original = structuredClone(input);
    const status = projectAiProviderStatus(input);
    expect(status.label).toBe('待任务费用授权 1/1');
    expect(status.tone).toBe('secondary');
    expect(status.budgetNote).toContain('具体任务');
    expect(input).toEqual(original);
  });

  it('按用途区分兼容失败与费用条件，历史测试不覆盖当前限制', () => {
    const status = projectAiProviderStatus([
      route(['budget_not_authorized']),
      route(['adapter_contract_evidence_missing', 'budget_not_authorized'], 'arena_live_research'),
    ]);
    expect(status.label).toBe('配置待处理 1/2');
    expect(status.tone).toBe('destructive');
    expect(status.testLabel).toBe('历史用途测试通过');
    expect(status.routes[0]?.purpose).toBe('模拟交易决策');
    expect(status.routes[0]?.readinessLabel).toBe('待任务费用授权');
    expect(status.routes[0]?.reasons).toHaveLength(0);
    expect(status.routes[0]?.budgetPending).toBe(true);
    expect(status.routes[1]?.purpose).toBe('竞技场自主研究');
    expect(status.routes[1]?.version).toBe('V2');
    expect(status.routes[1]?.readinessLabel).toBe('配置待处理');
    expect(status.routes[1]?.reasons).toHaveLength(1);
    expect(status.routes[1]?.budgetPending).toBe(true);
  });

  it('缺少用途、全部通过与部分验证分别表达', () => {
    expect(projectAiProviderStatus().label).toBe('尚未配置模型用途');
    const ready = route([]);
    expect(projectAiProviderStatus([ready]).label).toBe('配置检查通过 1/1');
    expect(
      projectAiProviderStatus([ready, { ...ready, liveValidation: { status: 'not_run' } }])
        .testLabel,
    ).toBe('部分用途有历史测试记录');
    expect(
      projectAiProviderStatus([{ ...ready, liveValidation: { status: 'failed' } }]).testTone,
    ).toBe('destructive');
  });

  it('未知原因、停用、连接失败与撤销仍保留限制', () => {
    for (const code of [
      'future_reason',
      'provider_disabled',
      'provider_down',
      'capability_revoked',
    ]) {
      const status = projectAiProviderStatus([route([code, 'budget_not_authorized'])]);
      expect(status.tone).toBe('destructive');
      expect(status.routes[0]?.reasons).toHaveLength(1);
    }
    expect(aiProviderConnectionLabel('healthy')).toBe('最近连接成功');
    expect(aiProviderConnectionLabel('down')).toBe('最近连接失败');
    expect(aiProviderConnectionLabel('unknown')).toBe('连接状态待确认');
  });
});
