import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { ProviderCredentialFields } from './ProviderCredentialFields.js';
import {
  clearMarketProviderCredential,
  saveMarketProviderCredentials,
  testMarketProvider,
} from './market-data.api.js';
import { ProviderOAuthPanel } from './ProviderOAuthPanel.js';
import { providerTestMessage } from './provider-credentials.js';
import { marketDataKeys } from './market-data.queries.js';
import { credentialSourceLabel, validateCredentialDraft } from './provider-credentials.js';
import type { ProviderManifest, ProviderCredentialDraft } from './market-data.types.js';

export function ProviderCredentialsSheet({
  provider,
  onClose,
}: {
  provider: ProviderManifest;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<ProviderCredentialDraft>(() => ({
    method:
      provider.credentialSchema?.methods.find((item) => item.method !== 'oauth')?.method ?? '',
    values: {},
  }));
  const [oauthMode, setOauthMode] = useState(
    provider.providerId === 'longbridge' && provider.credentialMethod !== 'legacy',
  );
  const draftRevision = useRef(0);
  const testAbort = useRef<AbortController | null>(null);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);
  const client = useQueryClient();
  const { confirm } = useConfirmDialog();
  const dirty = Object.values(draft.values).some((value) => value.length > 0);
  const refresh = () => client.invalidateQueries({ queryKey: marketDataKeys.root });
  // 凭证通过组件闭包读取，不作为 mutation variables 留在全局缓存中。
  const save = useMutation({
    gcTime: 0,
    retry: false,
    mutationFn: () => saveMarketProviderCredentials(provider.providerId, draft),
    onSuccess: () => {
      setDraft((current) => ({ ...current, values: {} }));
      setFeedback({ error: false, text: '凭证已保存。可通过测试连接检查权限与可达性。' });
    },
    onError: () => setFeedback({ error: true, text: '凭证保存失败，请检查字段后重试。' }),
    onSettled: refresh,
  });
  const clear = useMutation({
    gcTime: 0,
    retry: false,
    mutationFn: () => clearMarketProviderCredential(provider),
    onSuccess: () => {
      setDraft((current) => ({ ...current, values: {} }));
      setFeedback({ error: false, text: '页面凭证已移除。有环境配置时将自动使用环境配置。' });
    },
    onError: () => setFeedback({ error: true, text: '移除失败，请稍后重试。' }),
    onSettled: refresh,
  });
  const test = useMutation({
    gcTime: 0,
    retry: false,
    mutationFn: async () => {
      const revision = draftRevision.current;
      const controller = new AbortController();
      testAbort.current = controller;
      try {
        const result = await testMarketProvider(provider, draft, controller.signal);
        return { revision, ...providerTestMessage(result) };
      } catch {
        return { revision, error: true, text: '测试未完成，请检查凭证或稍后重试。' };
      } finally {
        testAbort.current = null;
      }
    },
    onSuccess: (result) => {
      if (result.revision === draftRevision.current)
        setFeedback({ error: result.error, text: result.text });
    },
  });
  useEffect(() => () => testAbort.current?.abort(), []);
  useEffect(() => {
    if (save.isSuccess || save.isError) save.reset();
    if (clear.isSuccess || clear.isError) clear.reset();
    if (test.isSuccess || test.isError) test.reset();
  }, [
    save.isSuccess,
    save.isError,
    save.reset,
    clear.isSuccess,
    clear.isError,
    clear.reset,
    test.isSuccess,
    test.isError,
    test.reset,
  ]);
  const busy = save.isPending || clear.isPending;
  const close = async () => {
    if (busy) return;
    if (
      dirty &&
      !(await confirm({
        title: '放弃未保存的凭证？',
        description: '关闭后会清除本次输入。',
        confirmLabel: '放弃并关闭',
        cancelLabel: '继续编辑',
      }))
    )
      return;
    onClose();
  };
  const switchAuthentication = async (useOAuth: boolean) => {
    if (useOAuth === oauthMode) return;
    if (
      dirty &&
      !(await confirm({
        title: '切换认证方式？',
        description: '切换后清除当前未保存的密钥输入。',
        confirmLabel: '切换',
        cancelLabel: '继续编辑',
      }))
    )
      return;
    draftRevision.current++;
    testAbort.current?.abort();
    setDraft((value) => ({ ...value, values: {} }));
    setFeedback(null);
    setOauthMode(useOAuth);
  };
  const clearCredentials = async () => {
    if (
      !(await confirm({
        title: '移除页面凭证？',
        description: '移除后恢复 DSA 环境配置；没有环境配置时，此数据源将不可用。',
        confirmLabel: '移除凭证',
        cancelLabel: '取消',
        variant: 'destructive',
      }))
    )
      return;
    draftRevision.current++;
    testAbort.current?.abort();
    clear.mutate();
  };
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) void close();
      }}
    >
      <SheetContent size="compact">
        <SheetHeader>
          <SheetTitle>{provider.displayName} 凭证配置</SheetTitle>
          <SheetDescription>
            用于 ThesisLedger 的行情请求。页面配置优先于 DSA 环境配置。
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto">
          <div>
            <Badge variant="outline">{credentialSourceLabel(provider)}</Badge>
          </div>
          {provider.providerId === 'longbridge' && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="认证方式">
              <Button
                variant={oauthMode ? 'default' : 'outline'}
                disabled={busy}
                aria-pressed={oauthMode}
                onClick={() => void switchAuthentication(true)}
              >
                浏览器授权
              </Button>
              <Button
                variant={oauthMode ? 'outline' : 'default'}
                disabled={busy}
                aria-pressed={!oauthMode}
                onClick={() => void switchAuthentication(false)}
              >
                三项密钥
              </Button>
            </div>
          )}
          {oauthMode ? (
            <ProviderOAuthPanel />
          ) : (
            <>
              <ProviderCredentialFields
                provider={provider}
                draft={draft}
                disabled={busy}
                onChange={(next) => {
                  draftRevision.current++;
                  setDraft(next);
                  setFeedback(null);
                }}
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                凭证加密保存在服务端，保存后不回显。留空仅保留当前方式下已保存的页面字段。
              </p>
            </>
          )}
          {feedback && (
            <Alert variant={feedback.error ? 'destructive' : 'default'}>
              <AlertDescription role="status">{feedback.text}</AlertDescription>
            </Alert>
          )}
          {provider.credentialSource === 'control' && (
            <div>
              <Button variant="ghost" disabled={busy} onClick={() => void clearCredentials()}>
                移除页面凭证
              </Button>
            </div>
          )}
        </div>
        <SheetFooter>
          <Button variant="outline" disabled={busy} onClick={() => void close()}>
            关闭
          </Button>
          {!oauthMode && (
            <Button
              variant="outline"
              disabled={busy || test.isPending}
              onClick={() => {
                const error = validateCredentialDraft(provider, draft);
                if (error) {
                  setFeedback({ error: true, text: error });
                  return;
                }
                setFeedback(null);
                test.mutate();
              }}
            >
              {test.isPending ? '测试中…' : '测试当前输入'}
            </Button>
          )}
          {!oauthMode && (
            <Button
              disabled={busy || test.isPending || !dirty}
              onClick={() => {
                const error = validateCredentialDraft(provider, draft);
                if (error) {
                  setFeedback({ error: true, text: error });
                  return;
                }
                setFeedback(null);
                save.mutate();
              }}
            >
              {save.isPending ? '保存中…' : '保存凭证'}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
