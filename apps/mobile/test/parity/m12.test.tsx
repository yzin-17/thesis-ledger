// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { button, click, field, input, mount, setApi } from './mobile-view-harness';
import { TargetsForm } from '../../src/features/performance-targets/TargetsForm';
import {
  buildTargetsInput,
  targetDraft,
} from '../../src/features/performance-targets/targets-command';
import { ledgerAccountId } from './ledger-fixture';
const data = {
  scope: 'account' as const,
  accountId: ledgerAccountId,
  targets: { cash: 1 },
  version: 2,
};
describe('M12 配置目标保存', () => {
  it('修改其他分类时保留未编辑目标的原值', () => {
    const original = { stock: 1 / 3, etf: 1 / 3, cash: 1 / 3 };
    const draft = { ...targetDraft(original), etf: '30', cash: '36.66666666666667' };
    expect(buildTargetsInput(draft, ledgerAccountId).targets).toMatchObject({
      stock: original.stock,
      etf: 0.3,
      cash: 0.3666666666666667,
    });
  });
  it.each([1e-9, Number.MIN_VALUE])('极小目标 %s 生成普通小数并保持提交值', (weight) => {
    const draft = targetDraft({ stock: weight, cash: 1 });
    expect(draft.stock).not.toContain('e');
    expect(buildTargetsInput(draft, null).targets.stock).toBe(weight);
  });
  it('无法表示的非零权重不静默提交为零', () => {
    expect(() =>
      buildTargetsInput({ ...targetDraft({ cash: 1 }), stock: `0.${'0'.repeat(400)}1` }, null),
    ).toThrow('0～100%');
  });
  it('权重总和、负数和账户范围校验保留现行合同', () => {
    expect(
      buildTargetsInput(targetDraft({ stock: 0.5, cash: 0.5 }), ledgerAccountId),
    ).toMatchObject({
      scope: 'account',
      accountId: ledgerAccountId,
      targets: { stock: 0.5, cash: 0.5 },
    });
    expect(() => buildTargetsInput(targetDraft({ stock: 0.6 }), null)).toThrow('100%');
    expect(() => buildTargetsInput({ ...targetDraft({ cash: 1 }), stock: '-1' }, null)).toThrow(
      '非负',
    );
  });
  it('409 保稿并锁定保存，显式核对前不重复请求', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({ error: 'Conflict', message: '目标版本冲突' }, { status: 409 }),
      );
    setApi(fetcher);
    await mount(
      <TargetsForm
        data={data}
        accountId={ledgerAccountId}
        readable
        reload={vi.fn().mockResolvedValue(data)}
      />,
    );
    await input(field('股票目标（%）'), '50');
    await input(field('现金目标（%）'), '50');
    await click(button('保存配置目标'));
    expect(field('股票目标（%）').value).toBe('50');
    expect(button('保存配置目标').disabled).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain('目标版本冲突');
  });
  it('保存成功后刷新失败保留成功结果，不再次保存', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({ ...data, version: 3, targets: { stock: 0.5, cash: 0.5 } }),
      );
    setApi(fetcher);
    const client = await mount(
      <TargetsForm data={data} accountId={ledgerAccountId} readable reload={vi.fn()} />,
    );
    client.invalidateQueries = vi.fn().mockRejectedValue(new Error('读取失败'));
    await input(field('股票目标（%）'), '50');
    await input(field('现金目标（%）'), '50');
    await click(button('保存配置目标'));
    expect(button('保存配置目标').disabled).toBe(true);
    expect(document.body.textContent).toContain('请勿重复保存');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
