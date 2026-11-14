import type { ComponentProps } from 'react';
import { AutomationTable, AutomationRunHistoryTable } from './ProviderSettingsSections.js';
import { useRuleMonitorAutomation, ruleMonitorJobId } from './useRuleMonitorAutomation.js';

export function AutomationSettingsPanel({
  table,
  history,
}: {
  table: ComponentProps<typeof AutomationTable>;
  history: ComponentProps<typeof AutomationRunHistoryTable>;
}) {
  const controls = useRuleMonitorAutomation();
  return (
    <div className="flex flex-col gap-6">
      <AutomationTable
        {...table}
        togglingJobId={controls.pending === 'toggle' ? ruleMonitorJobId : table.togglingJobId}
        runningJobId={controls.running ? ruleMonitorJobId : table.runningJobId}
        onToggle={(job) => controls.handleAction(job, 'toggle', table.onToggle)}
        onRun={(job) => controls.handleAction(job, 'run', table.onRun)}
      />
      <AutomationRunHistoryTable {...history} />
    </div>
  );
}
