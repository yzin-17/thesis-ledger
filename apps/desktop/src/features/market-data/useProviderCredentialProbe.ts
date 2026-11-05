import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { marketProviderAccountLevelSchema, type MarketProviderAccountAccessReport, type MarketProviderAccountLevel } from '@thesis-ledger/schemas';
import { testMarketProvider } from './market-data.api.js';
import { marketDataKeys } from './market-data.queries.js';
import { providerTestMessage } from './provider-credentials.js';
import { accountAccessReportMessage } from './provider-account-access.js';
import type { ProviderCredentialDraft, ProviderManifest } from './market-data.types.js';

type Feedback = { error: boolean; text: string };

/** 草稿凭证仅通过闭包传入请求；不进入 Query key、mutation variables 或缓存。 */
export function useProviderCredentialProbe(provider: ProviderManifest, draft: ProviderCredentialDraft,
  revision: MutableRefObject<number>, publishFeedback: (feedback: Feedback) => void, level?: MarketProviderAccountLevel) {
  const [report, setReport] = useState<MarketProviderAccountAccessReport | null>(null);
  const abort = useRef<AbortController | null>(null);
  const active = useRef(true);
  const client = useQueryClient();
  const test = useMutation({
    gcTime: 0, retry: false,
    mutationFn: async (savedVersion?: number) => {
      const inputRevision = revision.current;
      const controller = new AbortController();
      abort.current = controller;
      const dirty = Object.values(draft.values).some((value) => value.length > 0);
      const configured = marketProviderAccountLevelSchema.safeParse(provider.settings?.accountLevel);
      let levelChanged = configured.success;
      if (level) {
        levelChanged = !configured.success || level.points !== configured.data.points ||
          level.independentApis.length !== configured.data.independentApis.length ||
          level.independentApis.some((api) => !configured.data.independentApis.includes(api));
      }
      try {
        const result = await testMarketProvider(provider,
          savedVersion === undefined && dirty ? draft : undefined, controller.signal, undefined,
          provider.accountAccessSupported ? 'account_access' : undefined,
          dirty || levelChanged ? level : undefined);
        if (provider.accountAccessSupported && (result.purpose !== 'account_access' || !result.accountAccess))
          throw new Error('服务未返回逐功能账户权限结果');
        if (savedVersion !== undefined && result.accountAccess?.configVersion !== savedVersion)
          throw new Error('账户配置在检查前发生变化');
        const feedback = result.accountAccess ? accountAccessReportMessage(result.accountAccess) : providerTestMessage(result);
        return { inputRevision, feedback, report: result.accountAccess ?? null };
      } catch {
        return { inputRevision, feedback: { error: true, text: '检查未完成，请检查凭证或稍后重试。' }, report: null };
      } finally {
        if (abort.current === controller) abort.current = null;
      }
    },
    onSuccess: (result) => {
      if (!active.current || result.inputRevision !== revision.current) return;
      setReport(result.report);
      publishFeedback(result.feedback);
      if (result.report?.credentialContext === 'current')
        void client.invalidateQueries({ queryKey: marketDataKeys.root });
    },
  });
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; abort.current?.abort(); };
  }, []);
  useEffect(() => {
    if (test.isSuccess || test.isError) test.reset();
  }, [test.isSuccess, test.isError, test.reset]);
  const clear = () => { abort.current?.abort(); setReport(null); };
  const checkSaved = (configVersion: number) => {
    if (!provider.accountAccessSupported) return;
    revision.current++;
    clear();
    test.mutate(configVersion);
  };
  return { test, report, clear, checkSaved };
}
