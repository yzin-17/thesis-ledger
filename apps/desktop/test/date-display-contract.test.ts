import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatDateOnly, formatDateTime } from '../src/lib/date-display.js';

const sourceRoot = new URL('../src/features/', import.meta.url);

const featureSource = (directory: URL = sourceRoot): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const location = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory);
    if (entry.isDirectory()) return featureSource(location);
    if (!entry.name.endsWith('.tsx')) return [];
    return [readFileSync(location, 'utf8')];
  });

describe('用户可见日期时间展示契约', () => {
  it('将 ISO 时间戳显示为中文本地时间，保留业务纯日期和月份，并为无效值提供占位', () => {
    const timestamp = '2026-09-08T09:31:12.039Z';
    const formatted = formatDateTime(timestamp, '未知');

    expect(formatted).toMatch(/2026\/09\/08/);
    expect(formatted).not.toContain('T');
    expect(formatted).not.toContain('Z');
    expect(formatDateTime('2026-09-08', '未知')).toBe('2026-09-08');
    expect(formatDateTime('2026-09', '未知')).toBe('2026-09');
    expect(formatDateTime('not-a-time', '未知')).toBe('未知');
    expect(formatDateTime(null, '未知')).toBe('未知');
    expect(formatDateOnly(timestamp, '未知')).toBe('2026-09-08');
    expect(formatDateOnly('2026-09-08', '未知')).toBe('2026-09-08');
  });

  it('证据链和回测数据时点不得直接插入原始时间字段', () => {
    const source = featureSource().join('\n');
    const rawTimestampRender =
      /<(?:span|dd)\b[^>]*>[\s\S]{0,80}\{(?:call|citation)\.(?:observedAt|marketTime|availableAt|fetchedAt)\}/;

    expect(source).not.toMatch(rawTimestampRender);
    expect(source).not.toContain('{version?.schema ? schemaAsOf(version.schema) : \'未知\'}');
    expect(source).not.toContain('{displayValue(result.dataAsOf ?? job.dataAsOf ?? \'未知\')}');
  });
});
