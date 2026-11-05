// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { button, click, field, input, mount, setApi, view } from './mobile-view-harness';
import { monthlyAccount, monthlyOccurrence, monthlyPlan, monthlyTime } from './monthly-fixture';
import { cashPlanInput, cashOccurrenceInput } from '../../src/features/recurring-cash/cash-plan';
import { PlanEditor } from '../../src/features/recurring-plans/PlanEditor';
import { OccurrenceEditor } from '../../src/features/recurring-plans/OccurrenceEditor';

vi.mock('../../src/features/market/InstrumentPicker', () => ({ InstrumentPicker: () => null }));
describe('M09 定期入账计划与发生项', () => {
  it('账户类型、月份、日期和版本严格校验，确认保持实际金额与时刻', () => {
    const form = { name: '入账', amount: '100.12', day: '31', startPeriod: '2026-10' };
    expect(cashPlanInput(form, monthlyAccount)).toMatchObject({
      dayOfMonth: 31,
      timezone: 'Asia/Shanghai',
      expectedAmount: '100.12',
    });
    expect(cashPlanInput(form, monthlyAccount, 7)).toMatchObject({ expectedVersion: 7 });
    expect(() => cashPlanInput(form, { ...monthlyAccount, type: 'fund' })).toThrow('现金账户');
    expect(() => cashPlanInput({ ...form, day: '32' }, monthlyAccount)).toThrow();
    expect(cashOccurrenceInput({ amount: '101.5', occurredAt: monthlyTime }, 2)).toEqual({
      expectedVersion: 2,
      actualAmount: '101.5',
      occurredAt: monthlyTime,
    });
  });
  it('发生项 409 保留输入和原版本，不自动重试', async () => {
    view.params = {
      accountId: monthlyAccount.id,
      kind: 'cash',
      occurrence: monthlyOccurrence,
      action: 'confirm',
    };
    view.runtime.mode = 'actual';
    view.runtime.scope = ['mobile-v2', 'https://ledger.test/api/v1', 'actual', 'all'];
    const writes: unknown[] = [];
    setApi(
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          writes.push(JSON.parse(String(init.body)));
          return Response.json(
            {
              error: 'Conflict',
              errorCode: 'CASH_DEPOSIT_PLAN_VERSION_CONFLICT',
              message: '版本冲突，请重新核对',
            },
            { status: 409 },
          );
        }
        return Response.json(
          String(url).includes('/accounts') ? [monthlyAccount] : [monthlyOccurrence],
        );
      }),
    );
    await mount(<OccurrenceEditor />);
    await input(field('实际到账金额'), '125.5');
    await input(field('到账 ISO 时间'), monthlyTime);
    await click(button('确认发生项操作'));
    expect(writes).toEqual([
      { expectedVersion: 2, actualAmount: '125.5', occurredAt: monthlyTime },
    ]);
    expect(field('实际到账金额').value).toBe('125.5');
    expect(document.body.textContent).toContain('版本冲突');
  });
  it('保存计划成功而列表读取失败，不重复创建', async () => {
    view.params = { accountId: monthlyAccount.id, kind: 'cash' };
    view.runtime.mode = 'actual';
    view.runtime.scope = ['mobile-v2', 'https://ledger.test/api/v1', 'actual', 'all'];
    let written = false;
    let count = 0;
    setApi(
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          written = true;
          count++;
          return Response.json(monthlyPlan);
        }
        if (written) return Response.json({ message: '读取失败' }, { status: 503 });
        return Response.json(String(url).includes('/accounts') ? [monthlyAccount] : []);
      }),
    );
    await mount(<PlanEditor />);
    await input(field('月度计划名称'), '验收入账');
    await input(field('每期预计金额'), '100');
    await input(field('起始月份'), '2026-10');
    await click(button('保存月度计划'));
    expect(count).toBe(1);
    expect(button('保存月度计划').disabled).toBe(true);
    expect(document.body.textContent).toContain('请勿重复提交');
  });
  it('自己成功更新后的新版本不显示外部冲突，也不重复提交', async () => {
    view.params = {
      accountId: monthlyAccount.id,
      kind: 'cash',
      occurrence: monthlyOccurrence,
      action: 'skip',
    };
    view.runtime.mode = 'actual';
    view.runtime.scope = ['mobile-v2', 'https://ledger.test/api/v1', 'actual', 'all'];
    let written = false;
    let writes = 0;
    const next = {
      ...monthlyOccurrence,
      version: monthlyOccurrence.version + 1,
      status: 'SKIPPED',
      skippedReason: '本期未发生',
      skippedAt: monthlyTime,
    };
    setApi(
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          written = true;
          writes++;
          return Response.json(next);
        }
        return Response.json(
          String(url).includes('/accounts')
            ? [monthlyAccount]
            : [written ? next : monthlyOccurrence],
        );
      }),
    );
    await mount(<OccurrenceEditor />);
    await input(field('跳过原因'), '本期未发生');
    await click(button('确认发生项操作'));
    expect(document.body.textContent).toContain('发生项状态已更新');
    expect(document.body.textContent).not.toContain('发生项版本已变化');
    expect(button('确认发生项操作').disabled).toBe(true);
    expect(writes).toBe(1);
  });
});
