import { Switch, SwitchThumb } from '@/components/ui/switch';

export function RiskRuleEnableField({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <p className="m-0 text-sm font-medium">启用规则</p>
        <p className="field-hint">启用后会参与下一次当前模式风险扫描。</p>
      </div>
      <Switch variant="risk" checked={enabled} aria-label="启用规则" onCheckedChange={onChange}>
        <SwitchThumb variant="risk" />
      </Switch>
    </div>
  );
}
