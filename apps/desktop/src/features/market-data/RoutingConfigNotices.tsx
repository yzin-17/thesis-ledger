import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { useRoutingConfig } from './useRoutingConfig.js';

export function RoutingConfigNotices({
  state,
  errorMessage,
  blocked,
}: {
  state: ReturnType<typeof useRoutingConfig>;
  errorMessage: string | null;
  blocked: boolean;
}) {
  const { draft, baseline } = state;
  if (!draft || !baseline) return null;
  return (
    <>
      {' '}
      {(errorMessage || state.message) && (
        <Alert variant={errorMessage ? 'destructive' : 'default'}>
          <AlertDescription>{errorMessage ?? state.message}</AlertDescription>
        </Alert>
      )}
      {baseline.catalogStatus !== 'complete' && (
        <Alert>
          <AlertDescription>
            能力目录不可用，保留已配置来源，待目录恢复后再保存配置。
          </AlertDescription>
        </Alert>
      )}
      {Number(baseline.pendingChanges) > 0 && (
        <Alert>
          <AlertDescription>
            目录变化影响 {baseline.pendingChanges} 项已纳入能力，确认保存后应用新的覆盖。
          </AlertDescription>
        </Alert>
      )}
      {Number(baseline.legacyRuleCount) > 0 && (
        <Alert>
          <AlertDescription>
            {baseline.legacyRuleCount} 项旧汇总配置已按具体项保留现有来源，保存后完成整理。
          </AlertDescription>
        </Alert>
      )}
      {baseline.newKeys.length > 0 && (
        <Alert>
          <AlertDescription>
            目录新增 {baseline.newKeys.length} 项能力，尚未纳入配置。
            <Button
              variant="outline"
              size="sm"
              disabled={blocked}
              onClick={() =>
                state.change({
                  ...draft,
                  keys: [
                    ...draft.keys,
                    ...baseline.newKeys.filter(
                      (key) =>
                        !draft.keys.some((item) => JSON.stringify(item) === JSON.stringify(key)),
                    ),
                  ],
                })
              }
            >
              纳入新增能力
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}
