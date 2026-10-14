// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';
import { AuthoringRunIntents } from '../src/features/strategy-authoring/AuthoringRunIntents.js';
import { setIdentitySession } from '../src/shared/api/identity-session.js';
import type { StrategyVersion } from '../src/features/strategy/strategy.types.js';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const userId = '11111111-1111-4111-8111-111111111111';
const version = {
  id: 'version',
  version: 1,
  source: { kind: 'ai_assisted', referenceId: 'draft' },
} as StrategyVersion;
let root: Root | null = null;
let client: QueryClient;
let host: HTMLDivElement;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  client?.clear();
  host?.remove();
  setIdentitySession(null);
});
const render = async (
  intents: string[],
  selected: StrategyVersion | null = version,
  enabled = true,
) => {
  setIdentitySession({
    token: 'A'.repeat(43),
    expiresAt: '2026-10-07T00:00:00Z',
    principal: { id: userId, username: 'alice', displayName: '甲' },
  });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(['desktop', 'identity-context', 'A'.repeat(43)], {
    mode: 'account',
    principal: { id: userId, username: 'alice', displayName: '甲' },
  });
  client.setQueryData(['desktop', 'authoring-source', userId, version.id], {
    snapshot: { content: { runtimeIntents: intents } },
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <QueryClientProvider client={client}>
        <AuthoringRunIntents version={selected} enabled={enabled} />
      </QueryClientProvider>,
    ),
  );
  return host.textContent;
};
describe('回测配置消费编写来源意图', () => {
  it('展示不可变来源中的日期与资金意图，要求在配置中再次明确', async () => {
    const text = await render(['2026年区间', '初始资金十万元']);
    expect(text).toContain('2026年区间');
    expect(text).toContain('初始资金十万元');
    expect(text).toContain('请在下方明确日期、资金和数据设置');
    expect(host.querySelector('input')).toBeNull();
  });
  it.each(['empty', 'manual', 'missing', 'closed'])('%s 不产生意图提示', async (scenario) => {
    let selected: StrategyVersion | null = version;
    if (scenario === 'manual') selected = { ...version, source: { kind: 'manual' } };
    if (scenario === 'missing') selected = null;
    expect(
      await render(scenario === 'empty' ? [] : ['日期'], selected, scenario !== 'closed'),
    ).toBe('');
  });
});
