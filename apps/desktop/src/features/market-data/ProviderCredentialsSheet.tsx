import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Sheet,
  SheetContent,
  SheetBody,
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
} from './market-data.api.js';
import { ProviderOAuthPanel } from './ProviderOAuthPanel.js';
import { useProviderCredentialProbe } from './useProviderCredentialProbe.js';
import { ProviderAccountAccessPanel } from './ProviderAccountAccessPanel.js';
import { marketDataKeys } from './market-data.queries.js';
import { credentialSourceLabel, validateCredentialDraft } from './provider-credentials.js';
import type { ProviderManifest, ProviderCredentialDraft, MarketRouteCatalogReadV3 } from './market-data.types.js';

export function ProviderCredentialsSheet({
  provider: initialProvider,
  catalog,
  onClose,
}: {
  provider: ProviderManifest;
  catalog?: MarketRouteCatalogReadV3;
  onClose: () => void;
}) {
  const [savedConfiguration, setSavedConfiguration] = useState<
    Awaited<ReturnType<typeof saveMarketProviderCredentials>> | null
  >(null);
  const [fieldsRevision, setFieldsRevision] = useState(0);
  const provider =
    savedConfiguration && savedConfiguration.configVersion > (initialProvider.configVersion ?? -1)
      ? { ...initialProvider, ...savedConfiguration }
      : initialProvider;
  const [draft, setDraft] = useState<ProviderCredentialDraft>(() => ({
    method:
      provider.credentialSchema?.methods.find((item) => item.method !== 'oauth')?.method ?? '',
    values: {},
  }));
  const [oauthMode, setOauthMode] = useState(
    provider.providerId === 'longbridge' && provider.credentialMethod !== 'legacy',
  );
  const draftRevision = useRef(0);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);
  const client = useQueryClient();
  const { confirm } = useConfirmDialog();
  const dirty = Object.values(draft.values).some((value) => value.length > 0);
  const refresh = () => client.invalidateQueries({ queryKey: marketDataKeys.root });
  const probe = useProviderCredentialProbe(provider, draft, draftRevision, setFeedback);
  const test = probe.test;
  // 凭证通过组件闭包读取，不作为 mutation variables 留在全局缓存中。
  const save = useMutation({
    gcTime: 0,
    retry: false,
    mutationFn: () => saveMarketProviderCredentials(provider.providerId, draft),
    onSuccess: (configuration) => {
      setSavedConfiguration(configuration);
      setFieldsRevision((revision) => revision + 1);
      setDraft((current) => ({ ...current, values: {} }));
      setFeedback({ error: false, text: provider.accountAccessSupported
        ? '凭证已保存，正在检查账户功能权限。' : '凭证已保存。可通过测试连接检查权限与可达性。' });
      probe.checkSaved(configuration.configVersion);
    },
    onError: () => setFeedback({ error: true, text: '凭证保存失败，请检查字段后重试。' }),
    onSettled: refresh,
  });
  const clear = useMutation({
    gcTime: 0,
    retry: false,
    mutationFn: () => clearMarketProviderCredential(provider),
    onSuccess: (configuration) => {
      setSavedConfiguration(configuration);
      setFieldsRevision((revision) => revision + 1);
      setDraft((current) => ({ ...current, values: {} }));
      setFeedback({
        error: false,
        text: '页面凭证已移除。有环境配置时自动使用环境凭证；否则数据源已停用。',
      });
    },
    onError: () => setFeedback({ error: true, text: '移除失败，请稍后重试。' }),
    onSettled: refresh,
  });
  useEffect(() => {
    if (save.isSuccess || save.isError) save.reset();
    if (clear.isSuccess || clear.isError) clear.reset();
  }, [
    save.isSuccess,
    save.isError,
    save.reset,
    clear.isSuccess,
    clear.isError,
    clear.reset,
  ]);
  const busy = save.isPending || clear.isPending;
  let testLabel = '测试连接';
  if (test.isPending) testLabel = '测试中…';
  else if (dirty) testLabel = '测试当前输入';
  if (provider.accountAccessSupported) {
    if (test.isPending) testLabel = '检查权限中…';
    else if (dirty) testLabel = '检查当前输入权限';
    else testLabel = '检查功能权限';
  }
  let saveLabel = '保存凭证';
  if (save.isPending) saveLabel = '保存中…';
  else if (provider.accountAccessSupported) saveLabel = '保存并检查权限';
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
    probe.clear();
    setDraft((value) => ({ ...value, values: {} }));
    setFeedback(null);
    setOauthMode(useOAuth);
  };
  const clearCredentials = async () => {
    if (
      !(await confirm({
        title: '移除页面凭证？',
        description: '移除后恢复 DSA 环境配置；没有环境配置时，此数据源将停用。',
        confirmLabel: '移除凭证',
        cancelLabel: '取消',
        variant: 'destructive',
      }))
    )
      return;
    draftRevision.current++;
    probe.clear();
    clear.mutate();
  };
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) void close();
      }}
    >
      <SheetContent size="compact" className="min-h-0 overflow-hidden">
        <SheetHeader>
          <SheetTitle>{provider.displayName} {provider.providerId === 'futu' ? '连接配置' : '凭证配置'}</SheetTitle>
          <SheetDescription>
            {provider.providerId === 'futu'
              ? '连接已登录的 OpenD，只读取证券静态资料，不需要券商账号、交易密码或持仓权限。DSA 在本机 Docker 中时，可填写 host.docker.internal 和 OpenD 实际监听端口。'
              : '用于 ThesisLedger 的行情和证券资料请求。页面配置优先于 DSA 环境配置。'}
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-6">
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
            <ProviderOAuthPanel
              key={fieldsRevision}
              credentialConfigured={
                provider.configured &&
                provider.credentialConfigured &&
                provider.credentialSource === 'control' &&
                provider.credentialMethod === 'oauth'
              }
              disabled={busy}
            />
          ) : (
            <>
              <ProviderCredentialFields
                key={`${draft.method}-${fieldsRevision}`}
                provider={provider}
                draft={draft}
                disabled={busy}
                onChange={(next) => {
                  draftRevision.current++;
                  probe.clear();
                  setDraft(next);
                  setFeedback(null);
                }}
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                凭证加密保存在服务端，保存后不回显。点击“更换”可更新已配置的字段。
              </p>
            </>
          )}
          {feedback && (
            <Alert variant={feedback.error ? 'destructive' : 'default'}>
              <AlertDescription role="status">{feedback.text}</AlertDescription>
            </Alert>
          )}
          <ProviderAccountAccessPanel provider={provider} catalog={catalog} report={probe.report} dirty={dirty} />
          {provider.credentialSource === 'control' && (
            <div>
              <Button variant="ghost" disabled={busy} onClick={() => void clearCredentials()}>
                移除页面凭证
              </Button>
            </div>
          )}
        </SheetBody>
        <SheetFooter>
          <Button variant="outline" disabled={busy} onClick={() => void close()}>
            关闭
          </Button>
          {!oauthMode && (
            <Button
              variant="outline"
              disabled={busy || test.isPending}
              onClick={() => {
                const error = !dirty && provider.accountAccessSupported && provider.credentialConfigured
                  ? null : validateCredentialDraft(provider, draft);
                if (error) {
                  setFeedback({ error: true, text: error });
                  return;
                }
                setFeedback(null);
                test.mutate(undefined);
              }}
            >
              {testLabel}
            </Button>
          )}
          {!oauthMode && dirty && (
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
              {saveLabel}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
