import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import type { ResearchSubmissionV2 } from '@thesis-ledger/schemas';
import type { useResearchCapabilitiesQuery } from './research.queries.js';
import type { useAiRoutingSettingsQuery } from './ai.queries.js';

type Capabilities = ReturnType<typeof useResearchCapabilitiesQuery>;
type Settings = ReturnType<typeof useAiRoutingSettingsQuery>;
export function researchCreationReady(
  valid: boolean,
  settings: Settings,
  capability: Capabilities,
  scope: ResearchSubmissionV2['scope']['scope'],
) {
  if (
    !valid ||
    settings.isError ||
    settings.isPending ||
    capability.isError ||
    capability.isPending
  )
    return false;
  return Boolean(
    settings.data?.researchDefault &&
    capability.data?.canCreate &&
    capability.data.scopes.includes(scope),
  );
}
export function ResearchCreationReadiness({
  settings,
  capability,
}: {
  settings: Settings;
  capability: Capabilities;
}) {
  if (settings.isPending || capability.isPending)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        正在核对创建资格和研究默认模型…
      </p>
    );
  if (capability.isError)
    return (
      <Alert variant="destructive">
        <AlertTitle>创建资格暂时无法读取</AlertTitle>
        <AlertDescription>请稍后重试，已有报告仍可按原权限查看。</AlertDescription>
      </Alert>
    );
  return (
    <>
      {(!settings.data?.researchDefault || settings.isError) && (
        <Alert>
          <AlertTitle>研究默认模型尚不可用</AlertTitle>
          <AlertDescription>请在上方选择并保存研究默认模型。</AlertDescription>
        </Alert>
      )}
      {!capability.data?.canCreate && (
        <Alert>
          <AlertTitle>当前尚未开放研究创建</AlertTitle>
          <AlertDescription>已有报告仍可读取，可稍后再创建。</AlertDescription>
        </Alert>
      )}
    </>
  );
}
