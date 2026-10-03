import { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type {
  MarketPolicyDraftV3,
  MarketRouteCatalogReadV3,
  ProviderManifest,
} from './market-data.types.js';
import { applyHithinkPolicyPreset, hithinkPolicyPreset } from './market-policy-hithink-preset.js';

export function MarketPolicyPreset({
  policy,
  catalog,
  providers,
  disabled,
  onChange,
}: {
  policy: MarketPolicyDraftV3;
  catalog: MarketRouteCatalogReadV3 | undefined;
  providers: ProviderManifest[];
  disabled: boolean;
  onChange: (policy: MarketPolicyDraftV3) => void;
}) {
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const key = JSON.stringify({ policy, catalog, providers });
  useEffect(() => {
    if (previewKey !== null && previewKey !== key) setPreviewKey(null);
  }, [key, previewKey]);
  const preview = hithinkPolicyPreset(policy, catalog, providers);
  const visible = previewKey === key;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={disabled || preview.changes.length === 0}
          onClick={() => setPreviewKey(key)}
        >
          预览 HiThink 优先
        </Button>
        <span className="text-xs text-muted-foreground">
          {preview.reason ?? '为尚未选择的能力补充 HiThink 主源，保留已有主备。'}
        </span>
      </div>
      {visible && (
        <Alert>
          <AlertTitle>HiThink 优先预览</AlertTitle>
          <AlertDescription>
            <ul className="flex flex-col gap-1">
              {preview.changes.map((change) => (
                <li key={change.label}>{change.label} → HiThink</li>
              ))}
            </ul>
            <p>应用到草稿后，使用下方“保存路由策略”提交。</p>
            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                size="sm"
                disabled={disabled || preview.changes.length === 0}
                onClick={() => {
                  if (previewKey !== key) return;
                  onChange(applyHithinkPolicyPreset(policy, catalog, providers));
                  setPreviewKey(null);
                }}
              >
                应用到草稿
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setPreviewKey(null)}>
                取消预览
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
