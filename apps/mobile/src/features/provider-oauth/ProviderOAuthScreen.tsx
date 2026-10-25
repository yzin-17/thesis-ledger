import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { safeProviderOAuthUrl } from '@thesis-ledger/api-client';
import { useMobileRuntime, useDirtyForm } from '../../app/MobileRuntime';
import {
  Action,
  Copy,
  Feedback,
  Field,
  Page,
  QueryStatus,
  Section,
} from '../../components/MobilePrimitives';
import { openExternalLink } from '../../platform/links/open-link';
import { useConfigCommand } from '../configuration/use-config-command';
const labels = {
  starting: '正在启动',
  authorizing: '等待网页授权',
  succeeded: '服务端已确认授权成功',
  failed: '授权失败',
  cancelled: '已取消',
  expired: '已过期',
};
export function ProviderOAuthScreen() {
  const { api, scope } = useMobileRuntime();
  const [clientId, setClientId] = useState('');
  const [message, setMessage] = useState('');
  const command = useConfigCommand();
  const query = useQuery({
    queryKey: [...scope, 'configuration', 'oauth'],
    queryFn: ({ signal }) => api.providerOAuth.current(signal),
    refetchInterval: (state) => {
      const session = state.state.data?.session;
      return session &&
        ['starting', 'authorizing'].includes(session.status) &&
        Date.parse(session.expiresAt) > Date.now()
        ? 1500
        : false;
    },
  });
  const session = query.data?.session;
  const pending = session && ['starting', 'authorizing'].includes(session.status);
  const expired = Boolean(session && Date.parse(session.expiresAt) <= Date.now());
  useDirtyForm(Boolean(clientId), () => setClientId(''));
  const act = async (kind: 'create' | 'cancel' | 'open') => {
    try {
      if (kind === 'open') {
        const url = safeProviderOAuthUrl(session?.authorizationUrl);
        if (!url || expired || !pending) {
          setMessage('当前没有有效的授权地址，请重新读取会话。');
          return;
        }
        await openExternalLink(url);
        setMessage('已打开系统浏览器；返回应用后将重新读取会话，返回本身不代表授权成功。');
        return;
      }
      await command.submit(() =>
        kind === 'create'
          ? api.providerOAuth.create(clientId)
          : api.providerOAuth.cancel(session!.sessionId),
      );
      setClientId('');
      setMessage(kind === 'create' ? '授权会话已建立，请打开系统浏览器。' : '已请求取消授权。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作未完成。');
    }
  };
  return (
    <Page title="Longbridge 网页授权">
      <Copy muted>
        授权由服务端建立并确认。系统浏览器中的登录和回调必须能够到达服务端，应用不会把浏览器返回当作成功。
      </Copy>
      <Feedback message={message} />
      <QueryStatus query={query} retry={() => void query.refetch()} />
      <Section title="授权会话">
        <Field
          label="OAuth 客户端 ID"
          value={clientId}
          onChange={setClientId}
          editable={!command.pending}
        />
        <Action
          label="建立授权会话"
          disabled={
            command.pending || Boolean(pending && !expired) || !clientId.trim() || query.isError
          }
          onPress={() => void act('create')}
        />
        <Copy>
          {session
            ? `${labels[session.status]}${expired && pending ? '（本地已过期，请重新读取服务端终态）' : ''}；到期 ${session.expiresAt}`
            : '当前没有授权会话。'}
        </Copy>
        {session?.errorCode ? <Copy>授权原因：{session.errorCode}</Copy> : null}
        <Action
          label="在系统浏览器继续授权"
          disabled={!pending || expired || !safeProviderOAuthUrl(session?.authorizationUrl)}
          onPress={() => void act('open')}
        />
        <Action
          label="重新读取授权状态"
          disabled={query.isFetching}
          onPress={() => void query.refetch()}
        />
        <Action
          label="取消网页授权"
          disabled={command.pending || !pending}
          onPress={() => void act('cancel')}
        />
      </Section>
    </Page>
  );
}
