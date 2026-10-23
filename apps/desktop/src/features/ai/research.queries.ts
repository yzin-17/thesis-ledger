import { useSyncExternalStore } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  researchReportListQuerySchema,
  researchReportLocatorSchema,
  researchReportComparisonQuerySchema,
  researchObservationReadQuerySchema,
  type ResearchReportListInput,
  type ResearchReportLocatorInput,
  type ResearchObservationReadInput,
} from '@thesis-ledger/schemas';
import { getDesktopApiClient } from '../../shared/api/client.js';
import {
  currentIdentitySession,
  subscribeIdentitySession,
} from '../../shared/api/identity-session.js';
import { reportToAiRun } from './research-report-display.js';

export const researchKeys = {
  root: ['desktop', 'research-reports'] as const,
  list: (owner: string, query: object) => [...researchKeys.root, owner, 'list', query] as const,
  detail: (owner: string, id: string, locator: object) =>
    [...researchKeys.root, owner, 'detail', id, locator] as const,
  evidence: (owner: string, id: string, reference: string, locator: object) =>
    [...researchKeys.root, owner, 'evidence', id, reference, locator] as const,
  comparison: (owner: string, id: string, query: object) =>
    [...researchKeys.root, owner, 'comparison', id, query] as const,
  observations: (owner: string, id: string, query: object) =>
    [...researchKeys.root, owner, 'observations', id, query] as const,
  observationHistory: (owner: string, id: string, observationId: string, query: object) =>
    [...researchKeys.root, owner, 'observation-history', id, observationId, query] as const,
  observationSubmission: (owner: string, id: string, claimId: string, locator: object) =>
    [...researchKeys.root, owner, 'observation-submission', id, claimId, locator] as const,
};
export const useResearchIdentity = () =>
  useSyncExternalStore(
    subscribeIdentitySession,
    () => currentIdentitySession()?.principal.id ?? 'local-workspace',
    () => 'local-workspace',
  );
export function useResearchReportsQuery(input: ResearchReportListInput) {
  const owner = useResearchIdentity();
  const query = researchReportListQuerySchema.parse(input);
  return useInfiniteQuery({
    placeholderData: () => undefined,
    queryKey: researchKeys.list(owner, query),
    queryFn: ({ pageParam, signal }) =>
      getDesktopApiClient().research.list(
        { ...query, ...(pageParam ? { cursor: pageParam } : {}) },
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    select: (data) => ({
      ...data,
      pages: data.pages.map((page) => ({ ...page, items: page.items.map(reportToAiRun) })),
    }),
    staleTime: 5_000,
    refetchInterval: (state) =>
      state.state.data?.pages.some((page) =>
        page.items.some((row) => ['queued', 'running'].includes(row.status)),
      )
        ? 1_500
        : false,
  });
}
export function useResearchCapabilitiesQuery(enabled: boolean) {
  const owner = useResearchIdentity();
  return useQuery({
    placeholderData: () => undefined,
    queryKey: [...researchKeys.root, owner, 'capabilities'],
    queryFn: ({ signal }) => getDesktopApiClient().research.capabilities(signal),
    enabled,
    staleTime: 15_000,
    retry: false,
  });
}
export function useResearchReportQuery(id: string | null, input: ResearchReportLocatorInput) {
  const owner = useResearchIdentity();
  const locator = researchReportLocatorSchema.parse(input);
  return useQuery({
    placeholderData: () => undefined,
    queryKey: researchKeys.detail(owner, id ?? '', locator),
    queryFn: ({ signal }) => getDesktopApiClient().research.detail(id ?? '', locator, signal),
    select: reportToAiRun,
    enabled: Boolean(id),
    staleTime: 1_000,
    retry: false,
    refetchInterval: (state) =>
      state.state.data && ['queued', 'running'].includes(state.state.data.status) ? 1_500 : false,
  });
}

export function useResearchComparisonQuery(
  id: string,
  locator: ResearchReportLocatorInput,
  beforeId: string | null,
  enabled: boolean,
) {
  const owner = useResearchIdentity();
  const query = researchReportComparisonQuerySchema.parse({
    ...locator,
    ...(beforeId ? { beforeId } : {}),
  });
  return useQuery({
    placeholderData: () => undefined,
    queryKey: researchKeys.comparison(owner, id, query),
    queryFn: ({ signal }) => getDesktopApiClient().research.compare(id, query, signal),
    enabled,
    staleTime: 0,
    retry: false,
  });
}

export function useResearchObservationsQuery(
  id: string,
  input: ResearchObservationReadInput,
  enabled: boolean,
) {
  const owner = useResearchIdentity();
  const query = researchObservationReadQuerySchema.parse(input);
  return useQuery({
    placeholderData: () => undefined,
    queryKey: researchKeys.observations(owner, id, query),
    queryFn: ({ signal }) => getDesktopApiClient().research.observations(id, query, signal),
    enabled,
    staleTime: 0,
    retry: false,
  });
}
export function useResearchObservationHistoryQuery(
  id: string,
  observationId: string | null,
  input: ResearchReportLocatorInput,
  enabled: boolean,
) {
  const owner = useResearchIdentity();
  const locator = researchReportLocatorSchema.parse(input);
  return useQuery({
    placeholderData: () => undefined,
    queryKey: researchKeys.observationHistory(owner, id, observationId ?? '', locator),
    queryFn: ({ signal }) =>
      getDesktopApiClient().research.observationHistory(id, observationId ?? '', locator, signal),
    enabled: enabled && Boolean(observationId),
    staleTime: 0,
    retry: false,
  });
}
