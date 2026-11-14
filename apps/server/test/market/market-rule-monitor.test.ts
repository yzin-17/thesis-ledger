import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { MarketRuleMonitorController } from '../../src/market/market-rule-monitor.controller.js';
import { DsaError, type DsaClient } from '../../src/integration/dsa/dsa.client.js';

const fixture = () =>
  JSON.parse(
    readFileSync(
      new URL('../../../../packages/schemas/fixtures/rule-source-monitor-v1.json', import.meta.url),
      'utf8',
    ),
  );
const controller = (control: ReturnType<typeof vi.fn>) =>
  new MarketRuleMonitorController({ control } as unknown as DsaClient);
describe('收费资料监测边界代理', () => {
  it('正文与基准必须属于请求版本；非法输入零发送，缺失版本保留404', async () => {
    const sample = JSON.parse(
      readFileSync(
        new URL(
          '../../../../packages/schemas/fixtures/rule-source-monitor-version.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    const control = vi.fn(async () => sample.detail);
    const reader = controller(control);
    const { kind, identity, contentHash, baseHash } = sample.request;
    expect(await reader.versionDetail(kind, identity, contentHash, baseHash)).toEqual(
      sample.detail,
    );
    await expect(reader.versionDetail(kind, identity, '../bad', baseHash)).rejects.toMatchObject({
      status: 400,
    });
    expect(control).toHaveBeenCalledTimes(1);
    await expect(reader.versionDetail(kind, identity, baseHash, contentHash)).rejects.toMatchObject(
      { status: 502 },
    );
    await expect(
      reader.versionDetail(kind, identity + 'other', contentHash, baseHash),
    ).rejects.toMatchObject({ status: 502 });
    await expect(reader.versionDetail(kind, identity, contentHash)).rejects.toMatchObject({
      status: 502,
    });
    control.mockRejectedValueOnce(new DsaError('受控缺失', 'unavailable', 404));
    await expect(reader.versionDetail(kind, identity, contentHash, baseHash)).rejects.toMatchObject(
      { status: 404, response: { code: 'rule_monitor_version_not_found' } },
    );
  });
  it('只使用Control与单次传输，保留真实持久状态', async () => {
    const sample = fixture();
    const control = vi.fn(async () => sample.status);
    expect(await controller(control).status()).toEqual(sample.status);
    expect(control.mock.calls[0]).toEqual([
      '/api/v3/thesis-ledger/control/rule-monitor',
      undefined,
      1,
    ]);
  });
  it('外部URL、无来源开启及非法身份在调用前拒绝', async () => {
    const sample = fixture();
    const control = vi.fn();
    const reader = controller(control);
    await expect(
      reader.check({ ...sample.request, url: 'https://example.invalid' }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      reader.configure({
        version: sample.request.version,
        expectedRevision: 0,
        enabled: true,
        sourceIds: [],
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(reader.job('../bad')).rejects.toMatchObject({ status: 400 });
    expect(control).not.toHaveBeenCalled();
  });
  it('拒绝其他任务和文档响应，不能只凭结构合格认领成功', async () => {
    const sample = fixture();
    const control = vi.fn(async () => sample.queued);
    await expect(
      controller(control).job('00000000-0000-4000-8000-000000000099'),
    ).rejects.toMatchObject({ status: 502 });
    control.mockResolvedValueOnce(sample.versions);
    await expect(controller(control).versions('document', 'other')).rejects.toMatchObject({
      status: 502,
    });
  });
  it('服务失败保持不可用，只有成功查无任务才返回404', async () => {
    const control = vi
      .fn()
      .mockRejectedValueOnce(new DsaError('受控不可用', 'unavailable', 503))
      .mockRejectedValueOnce(new DsaError('受控缺失', 'unavailable', 404));
    const reader = controller(control);
    const identity = '00000000-0000-4000-8000-000000000099';
    await expect(reader.job(identity)).rejects.toMatchObject({ status: 503 });
    await expect(reader.job(identity)).rejects.toMatchObject({ status: 404 });
  });
});
