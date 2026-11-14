import { describe, expect, it } from 'vitest';
import { automationStatusLabel, automationTypeLabel } from '../src/features/automation/automation-labels';

describe('自动化来源监测的移动端标签', () => {
  it('任务与异常状态使用中文业务名称', () => {
    expect(automationTypeLabel('rule-source-monitor')).toBe('收费资料检查');
    expect(automationStatusLabel('partial')).toBe('部分资料不可读');
    expect(automationStatusLabel('interrupted')).toBe('已中断');
    expect(automationStatusLabel('queued')).toBe('等待运行');
  });
});
