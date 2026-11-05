import { describe, expect, it } from 'vitest';
import { parsePricingMigrationArguments } from '../../src/ai/ai-provider-pricing-migration.cli.js';

describe('模型价格迁移维护入口', () => {
  it('默认只读，重复的明确范围不扩展为全部配置', () => {
    expect(parsePricingMigrationArguments([]).apply).toBe(false);
    expect(
      parsePricingMigrationArguments(['--provider', 'only', '--provider', 'only']).names,
    ).toEqual(['only']);
  });

  it('只有显式应用及完整预览绑定才能进入写路径', () => {
    expect(
      parsePricingMigrationArguments([
        '--apply',
        '--expected-fingerprint',
        'a'.repeat(64),
        '--expected-database',
        'fixture',
        '--expected-role',
        'fixture_owner',
        '--provider',
        'controlled',
      ]),
    ).toMatchObject({
      apply: true,
      names: ['controlled'],
      database: 'fixture',
      role: 'fixture_owner',
    });
  });

  it.each(
    [
      ['--apply'],
      ['--apply', '--apply'],
      ['--provider'],
      ['--provider', '--apply'],
      ['--force'],
      ['--expected-fingerprint', 'a'.repeat(64)],
      [
        '--apply',
        '--expected-fingerprint',
        'bad',
        '--expected-database',
        'x',
        '--expected-role',
        'y',
      ],
      [
        '--apply',
        '--expected-fingerprint',
        'a'.repeat(64),
        '--expected-database',
        'x',
        '--expected-database',
        'x',
        '--expected-role',
        'y',
      ],
    ].map((args) => ({ args })),
  )('参数错误在连接数据库前拒绝 $args', ({ args }) => {
    expect(() => parsePricingMigrationArguments(args)).toThrow();
  });
});
