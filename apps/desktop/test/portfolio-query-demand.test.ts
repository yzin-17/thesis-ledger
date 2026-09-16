import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import type { DesktopRequestClient } from '../src/features/shared/request.js';
import { accountDataKeys } from '../src/features/account-data/account-data.queries.js';
import { invalidatePortfolioChange } from '../src/features/account-data/portfolio-change.js';
import {
  accountChangeImpact,
} from '../src/features/portfolio/portfolio.account-actions.js';
import {
  cashSaveImpact,
  clearPositionsImpact,
  positionSaveImpact,
  removePositionImpact,
} from '../src/features/portfolio/portfolio.position-actions.js';
import {
  accountValuationQueryOptions,
  isPortfolioSummaryConsumerRoute,
  portfolioValuationQueryOptions,
  portfolioKeys,
} from '../src/features/portfolio/portfolio.queries.js';

const makeClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });

const makeRequestClient = () => {
  const request = vi.fn(async <T>() => {
    return {
      totalMarketValue: 100,
      totalCost: 90,
      totalPnl: 10,
      cashValue: 0,
      mode: 'actual',
      partial: false,
      valuedAt: '2026-09-15T00:00:00.000Z',
      positions: [],
    } as T;
  });
  return { client: { request } as unknown as DesktopRequestClient, request };
};

describe('组合估值按消费路由与影响范围失效', () => {
  it('只在实际消费组合摘要的路由启用 all valuation', () => {
    expect(isPortfolioSummaryConsumerRoute('/portfolio')).toBe(true);
    expect(isPortfolioSummaryConsumerRoute('/risk-center')).toBe(true);
    expect(isPortfolioSummaryConsumerRoute('/accounts')).toBe(false);
    expect(isPortfolioSummaryConsumerRoute('/position-entry')).toBe(false);
  });

  it.each(['/portfolio', '/risk-center'] as const)('%s 的 all valuation 只请求一次', async (route) => {
    const client = makeClient();
    const requestClient = makeRequestClient();
    const query = new QueryObserver(client, {
      ...portfolioValuationQueryOptions(
        'actual',
        isPortfolioSummaryConsumerRoute(route),
        requestClient.client,
      ),
    });

    await query.refetch();

    expect(requestClient.request).toHaveBeenCalledTimes(1);
    expect(requestClient.request).toHaveBeenCalledWith(
      '/portfolio/valuation?mode=actual',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('/accounts 的 shell 不请求 all，selected account 最多请求一次', async () => {
    const client = makeClient();
    const requestClient = makeRequestClient();
    const allQuery = new QueryObserver(client, {
      ...portfolioValuationQueryOptions('actual', isPortfolioSummaryConsumerRoute('/accounts'), requestClient.client),
    });
    const selectedQuery = new QueryObserver(client, {
      ...accountValuationQueryOptions('account-a', 'actual', true, requestClient.client),
    });

    if (allQuery.options.enabled) await allQuery.refetch();
    await selectedQuery.refetch();

    expect(requestClient.request).toHaveBeenCalledTimes(1);
    expect(requestClient.request).toHaveBeenCalledWith(
      '/portfolio/valuation?mode=actual&accountId=account-a',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('具体账户 mutation 只重取 active selected，inactive all 不请求', async () => {
    const client = makeClient();
    const requestClient = makeRequestClient();
    const allQuery = new QueryObserver(client, {
      ...portfolioValuationQueryOptions('actual', false, requestClient.client),
      staleTime: Infinity,
    });
    const selectedQuery = new QueryObserver(client, {
      ...accountValuationQueryOptions('account-a', 'actual', true, requestClient.client),
      staleTime: Infinity,
    });
    client.setQueryData(portfolioKeys.valuation('actual'), {});
    client.setQueryData(portfolioKeys.valuation('actual', 'account-a'), {});
    const unsubscribe = selectedQuery.subscribe(() => undefined);

    await invalidatePortfolioChange(client, {
      mode: 'actual',
      accountIds: ['account-a'],
    });
    unsubscribe();

    expect(requestClient.request).toHaveBeenCalledTimes(1);
    expect(requestClient.request).toHaveBeenCalledWith(
      '/portfolio/valuation?mode=actual&accountId=account-a',
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(allQuery.options.enabled).toBe(false);
  });

  it.each([
    ['新增持仓', positionSaveImpact('actual', 'account-a'), ['account-a']],
    ['同账户编辑持仓', positionSaveImpact('actual', 'account-a', 'account-a'), ['account-a']],
    ['A→B 编辑持仓', positionSaveImpact('actual', 'account-b', 'account-a'), ['account-a', 'account-b']],
    ['删除持仓', removePositionImpact('actual', 'account-a'), ['account-a']],
    ['清空持仓', clearPositionsImpact('actual', 'account-a'), ['account-a']],
    ['现金变更', cashSaveImpact('actual', 'account-a'), ['account-a']],
    ['创建账户', accountChangeImpact('actual', 'account-a'), ['account-a']],
    ['停用账户', accountChangeImpact('actual', 'account-a'), ['account-a']],
    ['永久删除账户', accountChangeImpact('actual', 'account-a'), ['account-a']],
  ] as const)('%s 产生精确影响范围', (_name, impact, accountIds) => {
    expect(impact).toMatchObject({ mode: 'actual', accountIds });
    if (impact.accounts) {
      expect(impact).toMatchObject({ accounts: true });
      expect(impact.events).toBeUndefined();
      expect(impact.audit).toBeUndefined();
      expect(impact.reconciliation).toBeUndefined();
    } else {
      expect(impact).toMatchObject({ events: true, audit: true, reconciliation: true });
    }
  });

  it('A→B 只重取 active account，all 摘要只标记 stale 且 accountId 去重', async () => {
    const client = makeClient();
    const calls: string[] = [];
    const accountA = portfolioKeys.valuation('actual', 'account-a');
    const accountB = portfolioKeys.valuation('actual', 'account-b');
    const all = portfolioKeys.valuation('actual');

    client.setQueryData(accountA, { accountId: 'account-a' });
    client.setQueryData(accountB, { accountId: 'account-b' });
    client.setQueryData(all, { accountId: 'all' });
    client.setQueryData(accountDataKeys.events('account-a', 'actual', 'all'), { events: [] });
    client.setQueryData(accountDataKeys.events('account-a', 'shadow', 'all'), { events: [] });
    client.setQueryData(accountDataKeys.audit('account-b', 'actual'), { events: [] });
    client.setQueryData(accountDataKeys.reconciliation('account-a', 'actual'), { candidates: [] });
    const observer = new QueryObserver(client, {
      queryKey: accountA,
      queryFn: async () => {
        calls.push('account-a');
        return { accountId: 'account-a' };
      },
    });
    const unsubscribe = observer.subscribe(() => undefined);
    calls.length = 0;

    await invalidatePortfolioChange(client, {
      mode: 'actual',
      accountIds: ['account-a', 'account-b', 'account-a'],
      events: true,
      audit: true,
      reconciliation: true,
    });
    unsubscribe();

    expect(calls).toEqual(['account-a']);
    expect(client.getQueryState(accountB)?.isInvalidated).toBe(true);
    expect(client.getQueryState(all)?.isInvalidated).toBe(true);
    expect(client.getQueryState(accountDataKeys.events('account-a', 'actual', 'all'))?.isInvalidated).toBe(
      true,
    );
    expect(client.getQueryState(accountDataKeys.events('account-a', 'shadow', 'all'))?.isInvalidated).toBe(
      false,
    );
    expect(client.getQueryState(accountDataKeys.audit('account-b', 'actual'))?.isInvalidated).toBe(
      true,
    );
    expect(
      client.getQueryState(accountDataKeys.reconciliation('account-a', 'actual'))?.isInvalidated,
    ).toBe(true);
  });

  it('存在 active all consumer 时，mutation 只重取 all 一次', async () => {
    const client = makeClient();
    const requestClient = makeRequestClient();
    const all = portfolioKeys.valuation('actual');
    const selected = portfolioKeys.valuation('actual', 'account-a');
    client.setQueryData(all, { accountId: 'all' });
    client.setQueryData(selected, { accountId: 'account-a' });
    const observer = new QueryObserver(client, {
      ...portfolioValuationQueryOptions('actual', true, requestClient.client),
      staleTime: Infinity,
    });
    const selectedObserver = new QueryObserver(client, {
      ...accountValuationQueryOptions('account-a', 'actual', false, requestClient.client),
      staleTime: Infinity,
    });
    const unsubscribe = observer.subscribe(() => undefined);

    await invalidatePortfolioChange(client, {
      mode: 'actual',
      accountIds: ['account-a'],
      allSummary: true,
    });
    unsubscribe();

    expect(requestClient.request).toHaveBeenCalledTimes(1);
    expect(requestClient.request).toHaveBeenCalledWith(
      '/portfolio/valuation?mode=actual',
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(selectedObserver.options.enabled).toBe(false);
  });

  it('accounts 变更只失效账户列表，并保留 mode 隔离', async () => {
    const client = makeClient();
    const requests: string[] = [];
    const actual = portfolioKeys.valuation('actual', 'account-a');
    const shadow = portfolioKeys.valuation('shadow', 'account-a');
    client.setQueryData(actual, { mode: 'actual' });
    client.setQueryData(shadow, { mode: 'shadow' });
    client.setQueryData(portfolioKeys.accounts(), []);
    client.setQueryData(portfolioKeys.managedAccounts(), []);
    const accountsObserver = new QueryObserver(client, {
      queryKey: portfolioKeys.accounts(),
      queryFn: async () => {
        requests.push('accounts');
        return [];
      },
      staleTime: Infinity,
    });
    const managedObserver = new QueryObserver(client, {
      queryKey: portfolioKeys.managedAccounts(),
      queryFn: async () => {
        requests.push('managed');
        return [];
      },
      staleTime: Infinity,
    });
    const unsubscribeAccounts = accountsObserver.subscribe(() => undefined);
    const unsubscribeManaged = managedObserver.subscribe(() => undefined);

    await invalidatePortfolioChange(client, {
      mode: 'actual',
      accountIds: ['account-a'],
      accounts: true,
      allSummary: false,
    });
    unsubscribeAccounts();
    unsubscribeManaged();

    expect(requests).toEqual(['accounts', 'managed']);
    expect(client.getQueryState(actual)?.isInvalidated).toBe(true);
    expect(client.getQueryState(shadow)?.isInvalidated).toBe(false);
  });
});
