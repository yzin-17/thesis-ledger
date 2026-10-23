import { describe, expect, it } from 'vitest';
import {
  fundPlanInput,
  fundOccurrenceInput,
  isFundInvestmentInstrument,
} from '../../src/features/recurring-funds/fund-plan';
import { monthlyAccount } from './monthly-fixture';
const account = { ...monthlyAccount, type: 'fund' as const };
const form = {
  name: '基金定投',
  amount: '200.12',
  day: '23',
  startPeriod: '2026-10',
  symbol: '000001.OF',
};
describe('M10 基金定投领域输入', () => {
  it('接受目录实际返回的 MUTUAL_FUND，拒绝证券类型或错误市场代码', () => {
    expect(isFundInvestmentInstrument({ instrumentType: 'MUTUAL_FUND', symbol: '000001.OF' })).toBe(
      true,
    );
    expect(isFundInvestmentInstrument({ instrumentType: 'STOCK', symbol: '000001.OF' })).toBe(
      false,
    );
    expect(isFundInvestmentInstrument({ instrumentType: 'MUTUAL_FUND', symbol: '000001.SZ' })).toBe(
      false,
    );
  });
  it('只接受实际基金账户与场外基金，编辑固定原版本', () => {
    expect(fundPlanInput(form, account)).toMatchObject({
      symbol: '000001.OF',
      timezone: 'Asia/Shanghai',
    });
    expect(() => fundPlanInput({ ...form, symbol: '510300.SH' }, account)).toThrow();
    expect(() => fundPlanInput(form, monthlyAccount)).toThrow('基金账户');
    expect(() => fundPlanInput(form, { ...account, mode: 'shadow' })).toThrow('实际');
    expect(fundPlanInput(form, account, 8)).toMatchObject({
      expectedVersion: 8,
      expectedAmount: '200.12',
    });
  });
  it('确认份额、净值、费用及仅日期精度，拒绝错误时间与无效费用', () => {
    const occurrence = {
      quantity: '100.1234',
      price: '2.12345',
      commission: '1.25',
      occurredAt: '2026-10-23',
    };
    expect(fundOccurrenceInput(occurrence, 4)).toEqual({
      expectedVersion: 4,
      actualQuantity: '100.1234',
      unitPrice: '2.12345',
      commission: '1.25',
      occurredAt: '2026-10-23',
    });
    expect(() =>
      fundOccurrenceInput({ ...occurrence, occurredAt: '2026-10-23T01:00:00Z' }, 4),
    ).toThrow();
    expect(() => fundOccurrenceInput({ ...occurrence, commission: '-1' }, 4)).toThrow();
    expect(fundOccurrenceInput({ ...occurrence, commission: '' }, 4)).not.toHaveProperty(
      'commission',
    );
  });
});
