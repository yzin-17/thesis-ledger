import { useQuery } from '@tanstack/react-query';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useMobileRuntime } from '../../app/MobileRuntime';
import type { ResearchStackParams } from '../../app/navigation-types';
import { Copy, Page, QueryStatus } from '../../components/MobilePrimitives';
import { journalTaskKey, readJournalTasks } from './journal-tasks';
import { JournalAiPanel } from './JournalAiPanel';
export function JournalAiHistoryScreen() {
  const { params } = useRoute<RouteProp<ResearchStackParams, 'JournalAiHistory'>>();
  const { baseUrl, scope } = useMobileRuntime();
  const query = useQuery({
    queryKey: [...scope, 'journal-ai-tasks', params],
    queryFn: () => readJournalTasks(journalTaskKey(baseUrl, params.accountId, params.mode)),
    staleTime: 0,
  });
  return (
    <Page title="AI 解读任务历史">
      <Copy muted>读取本机保存的任务引用，服务端事实与历史输入保持原样。</Copy>
      <QueryStatus query={query} empty={!query.data?.length} retry={() => void query.refetch()} />
      {query.data?.map((task) => (
        <JournalAiPanel key={task.id} {...params} kind={task.kind} existingRunId={task.id} />
      ))}
    </Page>
  );
}
