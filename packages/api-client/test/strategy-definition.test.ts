import { describe, expect, it, vi } from 'vitest';
import { ThesisLedgerApiClient, ThesisLedgerContractError } from '../src/index.js';
const definition = { version: 3, name: '完整定义', execution: { custom: ['原样保留'] } };
const version = {
  id: 'version-1',
  strategyId: 'strategy-1',
  version: 1,
  schema: definition,
  source: { kind: 'manual' },
};
const row = { id: 'strategy-1', name: '验收策略', versions: [version] };
function setup(value: unknown) {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => new Response(JSON.stringify(value)));
  return {
    api: new ThesisLedgerApiClient('https://fixture.test/api/v1', fetcher).strategy.definitions,
    fetcher,
  };
}
describe('策略定义共享传输', () => {
  it('列表保留版本、来源和完整定义，传递查询取消信号', async () => {
    const { api, fetcher } = setup([row]);
    const controller = new AbortController();
    await expect(api.list(controller.signal)).resolves.toEqual([row]);
    expect(fetcher.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });
  it('创建不改写定义和原始输入，明确请求方法', async () => {
    const { api, fetcher } = setup(row);
    const input = { name: ' 验收策略 ', schema: definition, description: '用户说明' };
    await api.create(input);
    const init = fetcher.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual(input);
  });
  it('非法名称和额外字段在发请求前拒绝', () => {
    const { api, fetcher } = setup(row);
    expect(() => api.create({ name: ' ', schema: definition })).toThrow();
    expect(() =>
      api.create({ name: '策略', schema: definition, ownerId: '伪造' } as never),
    ).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('新版本只写 schema，路径编码且核对返回所属策略', async () => {
    const { api, fetcher } = setup({ ...version, strategyId: 'strategy/1' });
    await api.createVersion('strategy/1', definition);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('/strategy%2F1/versions');
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({ schema: definition });
    await expect(setup(version).api.createVersion('another', definition)).rejects.toBeInstanceOf(
      ThesisLedgerContractError,
    );
  });
  it('合同错误与读取失败保留错误，不替换为空策略库', async () => {
    await expect(setup([{ ...row, versions: null }]).api.list()).rejects.toBeInstanceOf(
      ThesisLedgerContractError,
    );
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('网络中断'));
    await expect(
      new ThesisLedgerApiClient('https://fixture.test', fetcher).strategy.definitions.list(),
    ).rejects.toThrow('网络中断');
  });
});
