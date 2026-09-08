import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../src/features/strategy/StrategySections.tsx', import.meta.url),
  'utf8',
);

describe('策略库展示契约', () => {
  it('不重复拼接已有标的描述，并格式化版本时点', () => {
    expect(source).toContain('description.startsWith(firstSymbol)');
    expect(source).toContain("formatDateTime(schemaAsOf(version.schema), '未知')");
  });

  it('已完成回测使用克制 Badge，并统一操作列语义', () => {
    expect(source).toContain("if (status === 'succeeded') return 'secondary';");
    expect(source).toContain('<StickyTableActionHeader>操作</StickyTableActionHeader>');
    expect(source).toContain('<StickyTableActionCell>');
  });
});
