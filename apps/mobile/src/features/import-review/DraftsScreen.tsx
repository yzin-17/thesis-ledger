import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { useMobileRuntime } from '../../app/MobileRuntime';
import { useAccounts } from '../../app/query/mobile-queries';
import type { AccountStackParams } from '../../app/navigation-types';
import { Action, Copy, Page, QueryStatus, Section } from '../../components/MobilePrimitives';
import { ScreenshotUpload } from '../screenshot-import/ScreenshotUpload';
export const draftStatusLabels = {
  pending: '待审核',
  reviewed: '已审核',
  partial: '部分提交',
  committed: '已提交',
  cancelled: '已取消',
};
export function DraftsScreen() {
  const { params } = useRoute<RouteProp<AccountStackParams, 'Drafts'>>();
  const navigation = useNavigation<NativeStackNavigationProp<AccountStackParams>>();
  const { api, scope } = useMobileRuntime();
  const accounts = useAccounts();
  const account = accounts.data?.find((item) => item.id === params.accountId);
  const query = useQuery({
    queryKey: [...scope, 'drafts', params.accountId],
    enabled: Boolean(account),
    queryFn: ({ signal }) => api.imports.getReviews(params.accountId, signal),
  });
  return (
    <Page title="持仓草稿与截图">
      <ScreenshotUpload
        accountId={params.accountId}
        disabled={!account?.active || accounts.isError || accounts.isFetching}
        onUploaded={() => void query.refetch()}
      />
      <QueryStatus
        query={query}
        empty={query.data?.length === 0}
        retry={() => void query.refetch()}
      />
      {query.data?.map((draft) => (
        <Section key={draft.id} title={`${draftStatusLabels[draft.status]} · ${draft.createdAt}`}>
          <Copy muted>
            修订 {draft.review?.revision ?? '缺失'} · {draft.review?.rows.length ?? 0} 行
          </Copy>
          <Action
            label="审核草稿"
            onPress={() => navigation.navigate('DraftReview', { ...params, draftId: draft.id })}
          />
        </Section>
      ))}
    </Page>
  );
}
