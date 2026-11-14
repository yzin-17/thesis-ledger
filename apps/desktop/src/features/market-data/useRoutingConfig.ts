import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  RoutingAuthoring,
  RoutingConfigPreview,
  RoutingConfigView,
} from '@thesis-ledger/schemas';
import { getDesktopApiClient } from '../../shared/api/client.js';
import { useNavigationGuard } from '../shared/navigation-guard.js';
import { marketDataKeys } from './market-data.queries.js';

export const routingConfigKey = [...marketDataKeys.root, 'routing-config'] as const;
export function useRoutingConfig() {
  const client = useQueryClient();
  const api = getDesktopApiClient().market;
  const query = useQuery({
    queryKey: routingConfigKey,
    queryFn: ({ signal }) => api.routingConfig(signal),
    retry: false,
  });
  const [baseline, setBaseline] = useState<RoutingConfigView | null>(null);
  const [draft, setDraft] = useState<RoutingAuthoring | null>(null);
  const [preview, setPreview] = useState<RoutingConfigPreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const dirty = Boolean(
    draft && baseline && JSON.stringify(draft) !== JSON.stringify(baseline.config),
  );
  const fingerprint = JSON.stringify(draft);
  const latest = useRef(fingerprint);
  latest.current = fingerprint;
  useEffect(() => {
    if (query.data && !dirty) {
      setBaseline(query.data);
      setDraft(query.data.config);
    }
  }, [query.data, dirty]);
  const input = () => {
    if (!draft || !baseline || baseline.catalogRevision === null) throw new Error('能力目录不可用');
    return {
      // 服务端从数据库恢复可信保留记录，避免重复回传使请求超限。
      config: { ...draft, preserved: [] },
      expectedRevision: baseline.revision,
      catalogRevision: baseline.catalogRevision,
    };
  };
  const previewMutation = useMutation({
    mutationFn: async () => ({ result: await api.previewRoutingConfig(input()), fingerprint }),
    onSuccess: (value) => {
      if (latest.current === value.fingerprint) setPreview(value.result);
    },
  });
  const saveMutation = useMutation({
    mutationFn: () => api.saveRoutingConfig({ ...input(), previewToken: preview?.previewToken }),
    onSuccess: async (result) => {
      setPreview(null);
      setMessage(
        result.syncState === 'applied'
          ? '路由配置已保存并应用'
          : '配置已保存，尚未应用；可重试应用',
      );
      const fresh = await client.fetchQuery({
        queryKey: routingConfigKey,
        queryFn: () => api.routingConfig(),
        staleTime: 0,
      });
      setBaseline(fresh);
      setDraft(fresh.config);
      await client.invalidateQueries({ queryKey: marketDataKeys.policy() });
    },
  });
  const busy = previewMutation.isPending || saveMutation.isPending;
  const change = (next: RoutingAuthoring) => {
    setDraft(next);
    setPreview(null);
    setMessage(null);
    previewMutation.reset();
    saveMutation.reset();
  };
  useNavigationGuard({
    draft,
    dirty,
    busy,
    discard: () => {
      setDraft(baseline?.config ?? null);
      setPreview(null);
    },
  });
  return {
    query,
    baseline,
    draft,
    dirty,
    preview,
    busy,
    message,
    change,
    previewMutation,
    saveMutation,
    closePreview: () => setPreview(null),
  };
}
