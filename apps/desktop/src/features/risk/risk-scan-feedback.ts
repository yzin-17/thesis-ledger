import type { RiskScanResult } from './risk.types.js';

type ScanFeedback = {
  title: string;
  type: 'success' | 'info' | 'warning' | 'error';
  description: string;
};

export function riskScanFeedback(
  result: RiskScanResult,
  completed: Omit<ScanFeedback, 'title'>,
): ScanFeedback {
  const failures = result.results.filter((row) => row.errorCode || row.error);
  if (failures.length > 0) {
    const failedRules = new Set(failures.map((row) => row.ruleId)).size;
    const eventCount = new Set(result.results.flatMap((row) => (row.eventId ? [row.eventId] : [])))
      .size;
    const partial =
      eventCount > 0 ||
      (result.evaluatedRuleCount !== undefined && result.evaluatedRuleCount > failedRules);
    const reasons = [
      ...new Set(
        failures.map((row) => row.error || '规则输入或执行条件不满足，请核对规则及持仓数据'),
      ),
    ];
    return {
      title: partial ? '风险扫描部分完成' : '风险扫描未完成',
      type: partial ? 'warning' : 'error',
      description: `${failedRules} 条规则处理未完成。${reasons.join('；')}。已记录 ${eventCount} 个风险事件。`,
    };
  }
  if (result.evaluatedRuleCount === 0) {
    return {
      title: '未执行风险扫描',
      type: 'info',
      description: '当前没有可执行的风险规则，请先创建或启用规则。',
    };
  }
  return { title: '风险扫描已完成', ...completed };
}
