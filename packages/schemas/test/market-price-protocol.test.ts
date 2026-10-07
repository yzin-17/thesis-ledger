import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  executionPriceProtocolSchema,
  sourcePriceBasisSchema,
} from '../src/market-price-protocol.js';

const fixture = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`../fixtures/execution-price.${name}.json`, import.meta.url), 'utf8'),
  );

describe('执行价格协议', () => {
  it('保留原生字段单位，旧输入不补默认值，非法单位拒绝', () => {
    const input = fixture('normalized-snapshot');
    expect(executionPriceProtocolSchema.parse(input).priceBasis.fieldUnits).toBeUndefined();
    const enriched = {
      ...input,
      priceBasis: { ...input.priceBasis, fieldUnits: { volume: 'hand', amount: 'CNY' } },
    };
    expect(executionPriceProtocolSchema.parse(enriched).priceBasis.fieldUnits).toEqual({
      volume: 'hand',
      amount: 'CNY',
    });
    expect(
      executionPriceProtocolSchema.safeParse({
        ...input,
        priceBasis: { ...input.priceBasis, fieldUnits: { volume: 'guessed', amount: 'CNY' } },
      }).success,
    ).toBe(false);
  });
  it('解析原始记账与未知基准的固定复权快照', () => {
    const raw = executionPriceProtocolSchema.parse(fixture('raw-events'));
    const normalized = executionPriceProtocolSchema.parse(fixture('normalized-snapshot'));
    expect(raw.priceBasis.quantityBasis).toBe('actual-units');
    expect(normalized.priceBasis.anchor).toBeNull();
    expect(normalized.priceBasis.dividendMeaning).toBe('provider-defined');
    expect(normalized.history.basis).toBe('fixed-provider-snapshot');
  });

  it('来源事实不允许 DSA 提前选择数量或记账方式', () => {
    const normalized = fixture('normalized-snapshot');
    const { quantityBasis, ...source } = normalized.priceBasis;
    expect(quantityBasis).toBe('normalized-units');
    expect(sourcePriceBasisSchema.safeParse(source).success).toBe(true);
    expect(sourcePriceBasisSchema.safeParse(normalized.priceBasis).success).toBe(false);
  });

  it('拒绝伪原始价格、真实数量与重复分红组合', () => {
    const normalized = fixture('normalized-snapshot');
    expect(
      executionPriceProtocolSchema.safeParse({
        ...normalized,
        priceBasis: { ...normalized.priceBasis, adjustment: 'none' },
      }).success,
    ).toBe(false);
    expect(
      executionPriceProtocolSchema.safeParse({
        ...normalized,
        priceBasis: { ...normalized.priceBasis, quantityBasis: 'actual-units' },
      }).success,
    ).toBe(false);
    expect(
      executionPriceProtocolSchema.safeParse({
        ...normalized,
        priceBasis: { ...normalized.priceBasis, dividendMeaning: 'explicit-cash' },
      }).success,
    ).toBe(false);
  });

  it('严格时点缺重建依据时拒绝，不降级为固定快照', () => {
    const normalized = fixture('normalized-snapshot');
    expect(
      executionPriceProtocolSchema.safeParse({
        ...normalized,
        history: { basis: 'point-in-time' },
      }).success,
    ).toBe(false);
    expect(
      executionPriceProtocolSchema.safeParse({
        ...normalized,
        history: { basis: 'point-in-time', reconstructionEvidenceRef: '' },
      }).success,
    ).toBe(false);
  });

  it('未知基准不能声称可转换；本地派生必须引用冻结输入', () => {
    const normalized = fixture('normalized-snapshot');
    expect(
      executionPriceProtocolSchema.safeParse({
        ...normalized,
        priceBasis: {
          ...normalized.priceBasis,
          conversionAvailable: true,
          conversionEvidenceRef: 'factor-proof',
        },
      }).success,
    ).toBe(false);
    expect(
      executionPriceProtocolSchema.safeParse({
        ...normalized,
        priceBasis: { ...normalized.priceBasis, method: 'local-derived' },
      }).success,
    ).toBe(false);
  });
});
