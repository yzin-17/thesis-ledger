import { useQuery } from '@tanstack/react-query';
import { useMobileRuntime } from '../../app/MobileRuntime';
import { Copy, Page, QueryList, Section } from '../../components/MobilePrimitives';
export function RiskEventsScreen() {
  const { api, scope } = useMobileRuntime();
  const query = useQuery({
    queryKey: [...scope, 'risk'],
    queryFn: ({ signal }) => api.risk.getEvents({ mode: scope[2] }, signal),
  });
  return (
    <Page title="风险事件">
      <QueryList
        query={query}
        empty={query.data?.length === 0}
        retry={() => void query.refetch()}
        label="正在刷新风险事件"
      >
        {query.data?.map((event) => (
          <Section key={event.id} title={event.message}>
            <Copy muted>
              规则版本 {event.ruleVersion} · {event.marketTime ?? event.evaluatedAt}
            </Copy>
          </Section>
        ))}
      </QueryList>
    </Page>
  );
}
