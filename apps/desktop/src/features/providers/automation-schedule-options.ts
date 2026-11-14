import { ruleMonitorDefaultSchedule } from '@thesis-ledger/schemas';
import { automationSchedulePresets } from './providers.types.js';

export function automationScheduleOptions(monitor: boolean) {
  if (!monitor) return automationSchedulePresets;
  const labels: Record<string, string> = {
    '0 16 * * 1-5': '每个工作日 16:00',
    '* * * * 1-5': '工作日每分钟',
  };
  return [
    { value: ruleMonitorDefaultSchedule, label: '每24小时' },
    ...automationSchedulePresets.map((preset) => ({
      ...preset,
      label: labels[preset.value] ?? preset.label,
    })),
  ];
}
