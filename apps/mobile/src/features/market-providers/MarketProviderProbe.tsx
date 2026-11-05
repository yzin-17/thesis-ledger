import {
  marketProviderTestInputSchema,
  type MarketProviderTestInput,
  type MarketProviderTestResponse,
} from '@thesis-ledger/schemas';
import { Action, Choices, Copy, Field, Section } from '../../components/MobilePrimitives';
export type ProviderProbeDraft = {
  route: string;
  points: string;
  hkDaily: boolean;
  realtime: boolean;
};
export function providerProbeInput(
  kind: 'test' | 'account',
  draft: ProviderProbeDraft,
  credentials: MarketProviderTestInput['credentials'],
): MarketProviderTestInput {
  if (kind === 'account' && (draft.hkDaily || draft.realtime) && !draft.points.trim())
    throw Error('声明独立权限时需同时填写账号积分');
  return marketProviderTestInputSchema.parse({
    ...(credentials ? { credentials } : {}),
    purpose: kind === 'account' ? 'account_access' : 'capability_read',
    ...(kind === 'account' && draft.points.trim()
      ? {
          accountLevel: {
            points: Number(draft.points),
            independentApis: [
              ...(draft.hkDaily ? ['hk_daily'] : []),
              ...(draft.realtime ? ['rt_k'] : []),
            ],
          },
        }
      : {}),
    ...(kind === 'test' && draft.route.trim() ? { route: JSON.parse(draft.route) as unknown } : {}),
  });
}
type Props = {
  draft: ProviderProbeDraft;
  change: (patch: Partial<ProviderProbeDraft>) => void;
  pending: boolean;
  accountSupported: boolean;
  run: (kind: 'test' | 'account') => void;
  result: MarketProviderTestResponse | null;
};
export function MarketProviderProbe({
  draft,
  change,
  pending,
  accountSupported,
  run,
  result,
}: Props) {
  return (
    <Section title="能力与账号检查">
      <Field
        label="精确能力目标（JSON，可留空）"
        value={draft.route}
        onChange={(route) => change({ route })}
        multiline
        editable={!pending}
      />
      <Action label="检查数据能力" disabled={pending} onPress={() => run('test')} />
      <Field
        label="账号积分（可选）"
        value={draft.points}
        onChange={(points) => change({ points })}
        keyboardType="number-pad"
        editable={!pending}
      />
      <Copy muted>
        支持积分等级的来源按填写等级检查；留空由服务端决定。声明独立权限时需同时填写积分；声明不能替代接口实际检查。
      </Copy>
      <Choices
        label="港股日线独立权限"
        value={String(draft.hkDaily)}
        options={[
          { value: 'false', label: '未开通港股日线' },
          { value: 'true', label: '已开通港股日线' },
        ]}
        onChange={(value) => change({ hkDaily: value === 'true' })}
        disabled={pending}
      />
      <Choices
        label="实时行情独立权限"
        value={String(draft.realtime)}
        options={[
          { value: 'false', label: '未开通实时行情' },
          { value: 'true', label: '已开通实时行情' },
        ]}
        onChange={(value) => change({ realtime: value === 'true' })}
        disabled={pending}
      />
      {!accountSupported ? <Copy muted>该来源未声明账号接口检查能力。</Copy> : null}
      <Action
        label="检查账号访问"
        disabled={pending || !accountSupported}
        onPress={() => run('account')}
      />
      {result ? <Copy>{JSON.stringify(result, null, 2)}</Copy> : null}
    </Section>
  );
}
