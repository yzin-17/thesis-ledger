import { useMobileIdentity } from '../../app/query/use-mobile-identity';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMobileRuntime } from '../../app/MobileRuntime';
import type { RootTabParams, MarketStackParams } from '../../app/navigation-types';
import { Action, Copy, Section, QueryList, QueryStatus } from '../../components/MobilePrimitives';
import type { MobileInstrument } from './market-model';
export function InstrumentResearch({ instrument }: { instrument: MobileInstrument }) {
  const { api, scope, mode } = useMobileRuntime();
  const root =
    useNavigation<NativeStackNavigationProp<MarketStackParams>>().getParent<
      BottomTabNavigationProp<RootTabParams>
    >();
  const known = instrument.assetType !== 'UNKNOWN';
  const lookup = useQuery({
    queryKey: [...scope, 'instrument-identity', instrument.symbol, instrument.assetType],
    enabled: known && !instrument.instrumentId,
    queryFn: ({ signal }) =>
      api.market.locateInstrument(instrument.symbol, instrument.assetType, signal),
    retry: false,
  });
  const id = instrument.instrumentId ?? lookup.data?.instrumentId;
  const locator = { view: 'scoped', mode, scope: 'instrument', instrumentId: id ?? '' } as const;
  const identity = useMobileIdentity();
  const owner = identity.data?.principal?.id;
  const reports = useQuery({
    queryKey: [...scope, 'instrument-reports', owner, locator],
    enabled: !!id && !!owner,
    queryFn: ({ signal }) => api.research.list({ ...locator, limit: 5 }, signal),
    retry: false,
    placeholderData: () => undefined,
  });
  return (
    <Section title="标的研究">
      {!id &&
        (!known || lookup.data ? (
          <Copy muted>当前目录身份不可用。</Copy>
        ) : (
          <QueryStatus query={lookup} retry={() => void lookup.refetch()} />
        ))}
      {id && (
        <>
          <Action
            label="发起标的研究"
            onPress={() =>
              root?.navigate('Research', { screen: 'ResearchSubmit', params: { instrumentId: id } })
            }
          />
          {reports.data?.items.length === 0 && <Copy muted>还没有这个标的的研究报告。</Copy>}
          <QueryList
            query={reports}
            retry={() => void reports.refetch()}
            label="正在刷新研究报告"
            gap={12}
          >
            {reports.data?.items.map((row) => (
              <Section key={row.id} title={row.question ?? '研究报告'}>
                <Copy>{row.createdAt}</Copy>
                <Copy>{row.summary ?? row.errorSummary ?? '暂无摘要'}</Copy>
                <Action
                  label="查看报告"
                  onPress={() =>
                    root?.navigate('Research', {
                      screen: 'ResearchReport',
                      params: { id: row.id, locator },
                    })
                  }
                />
              </Section>
            ))}
          </QueryList>
        </>
      )}
    </Section>
  );
}
