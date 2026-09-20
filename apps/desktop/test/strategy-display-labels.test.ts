import { describe, expect, it } from 'vitest';
import {
  strategyComparisonOperatorLabel,
  strategyMonitoringCoverageSourceLabel,
  strategyMonitoringMetricLabel,
  strategyRiskCycleModeLabel,
  strategyRiskEvaluationStateLabel,
  strategyRiskNotificationChannelLabel,
  strategyRiskNotificationSeverityLabel,
  strategyTimeframeLabel,
} from '../src/features/strategy/strategy-display-labels.js';

describe('策略中心共享中文显示标签', () => {
  it('覆盖风险预览的生效范围、指标、比较符、周期与状态', () => {
    expect(strategyRiskCycleModeLabel('existingAndFuture')).toBe('当前及未来持仓周期');
    expect(strategyMonitoringMetricLabel('priceToAverageCostReturn')).toBe(
      '价格相对平均成本收益率',
    );
    expect(strategyComparisonOperatorLabel('lte')).toBe('小于等于');
    expect(strategyTimeframeLabel('1d')).toBe('日线');
    expect(strategyRiskEvaluationStateLabel('unavailable')).toBe('不可用');
    expect(strategyRiskNotificationSeverityLabel('warning')).toBe('警告');
    expect(strategyRiskNotificationChannelLabel('feishu')).toBe('飞书');
  });

  it('把覆盖报告中的内部来源键转换为中文', () => {
    expect(strategyMonitoringCoverageSourceLabel('entry')).toBe('入场条件');
    expect(strategyMonitoringCoverageSourceLabel('sizing')).toBe('仓位配置');
    expect(strategyMonitoringCoverageSourceLabel('exit')).toBe('离场条件');
    expect(strategyMonitoringCoverageSourceLabel('risk:0:fixedStop')).toBe('固定止损');
  });
});
