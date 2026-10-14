import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { marketDataKeys } from './market-data.queries.js';
import {
  cancelProviderOAuth,
  createProviderOAuth,
  currentProviderOAuth,
  getProviderOAuth,
  oauthErrorLabels,
  oauthPending,
  safeOAuthUrl,
} from './provider-oauth.api.js';

const oauthKey = ['market-provider-oauth'] as const;

export function ProviderOAuthPanel({
  credentialConfigured,
  disabled = false,
}: {
  credentialConfigured: boolean;
  disabled?: boolean;
}) {
  const [clientId, setClientId] = useState('');
  const [reauthorizing, setReauthorizing] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const client = useQueryClient();
  const opened = useRef<string | null>(null);
  const refreshed = useRef<string | null>(null);
  const current = useQuery({
    queryKey: [...oauthKey, 'current'],
    queryFn: ({ signal }) => currentProviderOAuth(signal),
    gcTime: 0,
    retry: false,
  });
  useEffect(() => {
    if (!sessionId && !current.isFetching && current.data?.session)
      setSessionId(current.data.session.sessionId);
  }, [current.data, current.isFetching, sessionId]);
  const session = useQuery({
    queryKey: [...oauthKey, sessionId],
    queryFn: ({ signal }) => getProviderOAuth(sessionId!, signal),
    enabled: Boolean(sessionId),
    gcTime: 0,
    retry: false,
    refetchInterval: (query) =>
      !query.state.data || oauthPending(query.state.data) ? 1500 : false,
  });
  const result = session.data;
  const url = safeOAuthUrl(result?.authorizationUrl);
  useEffect(() => {
    if (url && result && opened.current !== result.sessionId) {
      opened.current = result.sessionId;
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    if (result?.status === 'succeeded' && refreshed.current !== result.sessionId) {
      refreshed.current = result.sessionId;
      setReauthorizing(false);
      setClientId('');
      void client.invalidateQueries({ queryKey: marketDataKeys.root });
    }
  }, [url, result, client]);
  const create = useMutation({
    gcTime: 0,
    retry: false,
    mutationFn: () => createProviderOAuth(clientId.trim()),
    onSuccess: (value) => {
      setSessionId(value.sessionId);
      client.setQueryData([...oauthKey, 'current'], { session: value });
      client.setQueryData([...oauthKey, value.sessionId], value);
      setClientId('');
    },
    onError: () => setActionError('无法发起授权，请检查 Client ID 和 DSA 授权组件后重试。'),
  });
  const cancel = useMutation({
    gcTime: 0,
    retry: false,
    mutationFn: async () => {
      await client.cancelQueries({ queryKey: [...oauthKey, sessionId] });
      return cancelProviderOAuth(sessionId!);
    },
    onSuccess: (value) => client.setQueryData([...oauthKey, value.sessionId], value),
    onError: () => setActionError('取消结果暂未确认，请刷新授权状态。'),
  });
  const pending = create.isPending || oauthPending(result);
  const authorized = credentialConfigured || result?.status === 'succeeded';
  const showInput = !pending && (!authorized || reauthorizing);
  let statusText = '输入 Longbridge 应用的 Client ID，在浏览器完成授权后会自动保存。';
  if (authorized) statusText = '已授权，凭证已加密保存。';
  if (create.isPending || result?.status === 'starting') statusText = '正在准备浏览器授权…';
  else if (result?.status === 'authorizing')
    statusText = '等待你在浏览器完成授权。关闭侧栏后授权仍会继续，可重新打开查看。';
  else if (result?.status === 'succeeded') statusText = '授权已完成，凭证已加密保存并生效。';
  else if (result?.status === 'cancelled') statusText = '本次授权已取消，原凭证保持不变。';
  else if (result?.status === 'failed' || result?.status === 'expired')
    statusText = oauthErrorLabels[result.errorCode ?? ''] ?? '授权未完成，原凭证保持不变。请重试。';
  return (
    <div className="flex flex-col gap-5">
      {showInput && (
        <div className="flex flex-col gap-2">
          <span id="longbridge-client-id" className="font-medium">
            Client ID
          </span>
          <Input
            aria-labelledby="longbridge-client-id"
            value={clientId}
            disabled={disabled}
            autoComplete="off"
            onChange={(event) => setClientId(event.target.value)}
            placeholder="请输入应用 Client ID"
          />
        </div>
      )}
      {authorized && !showInput && !pending && <Badge variant="secondary">已授权</Badge>}
      <div className="rounded-md border p-3 text-xs leading-relaxed text-muted-foreground">
        在 Longbridge 应用中登记回调地址：
        <code className="break-all">http://localhost:60355/callback</code>。支持本机和本机 Docker。
      </div>
      <p role="status" className="text-sm leading-relaxed">
        {statusText}
      </p>
      {(actionError || session.isError || current.isError) && (
        <Alert variant="destructive">
          <AlertDescription>
            {actionError ?? '授权状态暂不可用，授权可能仍在进行。请稍后重试。'}
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        {showInput && (
          <Button
            disabled={disabled || !clientId.trim()}
            onClick={() => {
              setActionError(null);
              create.mutate();
            }}
          >
            授权并保存
          </Button>
        )}
        {authorized && !showInput && !pending && (
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => {
              setActionError(null);
              setReauthorizing(true);
            }}
          >
            重新授权
          </Button>
        )}
        {authorized && showInput && (
          <Button
            variant="ghost"
            disabled={disabled}
            onClick={() => {
              setClientId('');
              setActionError(null);
              setReauthorizing(false);
            }}
          >
            取消重新授权
          </Button>
        )}
        {url && (
          <Button
            variant="outline"
            render={<a href={url} target="_blank" rel="noopener noreferrer" />}
          >
            打开授权页面
          </Button>
        )}
        {oauthPending(result) && (
          <Button
            variant="ghost"
            disabled={disabled || cancel.isPending}
            onClick={() => {
              setActionError(null);
              cancel.mutate();
            }}
          >
            取消授权
          </Button>
        )}
      </div>
      {result && oauthPending(result) && (
        <p className="text-xs text-muted-foreground">
          授权截止：{new Date(result.expiresAt).toLocaleTimeString('zh-CN')}
        </p>
      )}
    </div>
  );
}
