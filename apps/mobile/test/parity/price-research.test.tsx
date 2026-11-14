// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { projectPriceResearchStrategy, type BacktestStrategy } from '@thesis-ledger/schemas';
import { button, click, field, input, mount, setApi, view } from './mobile-view-harness';
import { BacktestSetupScreen } from '../../src/features/backtest-setup/BacktestSetupScreen';
import { b4Definition, b4Strategy, b4StrategyId, b4VersionId } from './batch4-fixture';
import { researchModel } from '../../../../packages/schemas/test/price-research-fixture';
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('手机收益研究的明确版本确认', () => {
  it('确认另存后使用新版本、后复权与研究协议提交，失败保留输入', async () => {
    const adopted = {
      ...b4Strategy.versions[0]!,
      id: '44444444-4444-4444-8444-444444444444',
      version: 2,
      schemaVersion: 3,
      schema: projectPriceResearchStrategy(b4Definition as BacktestStrategy),
    };
    const requests: { path: string; body: Record<string, unknown> }[] = [];
    let saved = false;
    setApi(
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(url)).pathname;
        if (!init?.method || init.method === 'GET')
          return Response.json([
            {
              ...b4Strategy,
              versions: saved ? [...b4Strategy.versions, adopted] : b4Strategy.versions,
            },
          ]);
        const body = JSON.parse(String(init.body));
        requests.push({ path, body });
        if (path.endsWith('/versions')) {
          saved = true;
          return Response.json(adopted);
        }
        if (path.endsWith('/run-config/execution-model')) {
          const model = structuredClone(researchModel);
          model.scope.range = { start: body.startDate, end: body.endDate };
          for (const segment of model.segments) segment.range = model.scope.range;
          return Response.json({
            status: 'available',
            policy: 'research-defaults',
            notes: ['受控研究设置'],
            model,
          });
        }
        if (path.endsWith('/strategy-submissions'))
          return Response.json(
            { error: 'controlled_failure', message: '受控提交失败' },
            { status: 503 },
          );
        throw Error(`未计划请求 ${path}`);
      }),
    );
    view.params = { strategyId: b4StrategyId, versionId: b4VersionId, kind: 'ordinary' };
    await mount(<BacktestSetupScreen />);
    await vi.waitFor(() => expect(button('采用研究口径并保存新版本')).toBeDefined());
    expect(button('后台准备并提交回测').disabled).toBe(true);
    expect(requests).toHaveLength(0);
    await click(button('采用研究口径并保存新版本'));
    await vi.waitFor(() => expect(document.body.textContent).toContain('受控研究设置'));
    await input(field('回测开始日期'), '2024-01-02');
    await input(field('回测结束日期'), '2024-03-29');
    await vi.waitFor(() =>
      expect(
        requests.some(
          (request) =>
            request.body.startDate === '2024-01-02' && request.body.endDate === '2024-03-29',
        ),
      ).toBe(true),
    );
    await click(button('后台准备并提交回测'));
    await vi.waitFor(() => expect(document.body.textContent).toContain('受控提交失败'));
    const submission = requests.find((request) => request.path.endsWith('/strategy-submissions'))!;
    expect(submission.body).toMatchObject({
      input: {
        kind: 'ordinary',
        preparation: {
          strategyVersionId: adopted.id,
          priceResearch: 'price-research-v1',
          adjustment: 'hfq',
          accountingBasis: 'normalized-series',
        },
      },
    });
    expect(field('回测开始日期').value).toBe('2024-01-02');
    expect(view.navigate).not.toHaveBeenCalled();
  });
});
