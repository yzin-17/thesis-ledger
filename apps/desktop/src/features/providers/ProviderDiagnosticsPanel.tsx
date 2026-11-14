import { resolveLoadState } from '../shared/loadState.js';
import { ProviderFailureDiagnostics } from './ProviderFailureDiagnostics.js';
import { DataQualityIssuesTable, NotificationFailuresTable } from './ProviderSettingsSections.js';
import type { useProviderQueries } from './providers.queries.js';
import type { AutomationJob } from './providers.types.js';

export function ProviderDiagnosticsPanel({
  queries,
  jobs,
  onHealthPage,
  onAutomationPage,
}: {
  queries: ReturnType<typeof useProviderQueries>;
  jobs: AutomationJob[];
  onHealthPage: (page: number) => void;
  onAutomationPage: (page: number) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <ProviderFailureDiagnostics
        health={queries.healthFailures}
        automation={queries.automationFailures}
        jobs={jobs}
        onHealthPage={onHealthPage}
        onAutomationPage={onAutomationPage}
      />
      <NotificationFailuresTable
        refreshing={queries.notificationFailures.isRefetching}
        loadState={resolveLoadState(
          [queries.notificationFailures],
          queries.notificationFailures.data !== undefined,
          queries.notificationFailures.data?.length === 0,
        )}
        notificationFailures={queries.notificationFailures.data ?? []}
        onRetry={() => void queries.notificationFailures.refetch()}
      />
      <DataQualityIssuesTable
        refreshing={queries.issues.isRefetching}
        loadState={resolveLoadState(
          [queries.issues],
          queries.issues.data !== undefined,
          queries.issues.data?.length === 0,
        )}
        issues={queries.issues.data ?? []}
        onRetry={() => void queries.issues.refetch()}
      />
    </div>
  );
}
