import { marketProviderAccountLevelSchema, type MarketProviderAccountLevel } from '@thesis-ledger/schemas';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import type { ProviderManifest } from './market-data.types.js';

export type AccountLevelDraft = { points: string; independentApis: MarketProviderAccountLevel['independentApis'] };

export function savedAccountLevel(provider: ProviderManifest): MarketProviderAccountLevel | null {
  const result = marketProviderAccountLevelSchema.safeParse(provider.settings?.accountLevel);
  return result.success ? { ...result.data, independentApis: result.data.independentApis.slice().sort() } : null;
}

export function parseAccountLevelDraft(draft: AccountLevelDraft): MarketProviderAccountLevel | null {
  if (!draft.points.trim()) return null;
  const result = marketProviderAccountLevelSchema.safeParse({ points: Number(draft.points), independentApis: draft.independentApis.slice().sort() });
  return result.success ? result.data : null;
}

const permissions = [{ api: 'hk_daily', label: '港股日线' }, { api: 'rt_k', label: '股票实时行情' }] as const;

export function ProviderAccountLevelFields({ value, onChange, disabled }: {
  value: AccountLevelDraft; onChange: (value: AccountLevelDraft) => void; disabled: boolean;
}) {
  return <FieldGroup>
    <Field>
      <FieldLabel>当前账号积分</FieldLabel>
      <Input type="number" min={0} step={1} value={value.points} disabled={disabled}
        aria-label="当前账号积分" onChange={(event) => onChange({ ...value, points: event.target.value })} />
      <FieldDescription>填写官网显示的积分，只检查当前积分包含的功能。</FieldDescription>
    </Field>
    <FieldSet>
      <FieldLegend>已开通的独立权限</FieldLegend>
      <div className="flex flex-col gap-3">
        {permissions.map(({ api, label }) => <div key={api} className="flex items-center gap-2">
          <Checkbox checked={value.independentApis.includes(api)} disabled={disabled}
            aria-label={`已开通${label}独立权限`} onCheckedChange={(checked) => onChange({ ...value,
              independentApis: checked ? [...value.independentApis, api] : value.independentApis.filter((item) => item !== api) })} />
          <span className="text-sm">{label}</span>
        </div>)}
      </div>
      <p className="text-sm text-muted-foreground">仅勾选已单独开通的项目，其余功能跳过检查。</p>
    </FieldSet>
  </FieldGroup>;
}
