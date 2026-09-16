import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  marketColorStorageKey,
  marketToneForValue,
  normalizeMarketColorScheme,
} from '../src/ui/market-color.js';

describe('Desktop 涨跌配色契约', () => {
  it('非法值和缺失值回退红涨绿跌', () => {
    expect(normalizeMarketColorScheme(null)).toBe('red-up');
    expect(normalizeMarketColorScheme('invalid')).toBe('red-up');
    expect(normalizeMarketColorScheme('green-up')).toBe('green-up');
    expect(marketColorStorageKey).toBe('thesis-ledger-market-color-scheme');
    expect(marketToneForValue(1)).toBe('up');
    expect(marketToneForValue(-1)).toBe('down');
    expect(marketToneForValue(0)).toBeUndefined();
    expect(marketToneForValue(null)).toBeUndefined();
  });

  it('金融颜色与固定状态颜色使用不同语义变量', () => {
    const tokens = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
    const base = readFileSync(new URL('../src/styles/base.css', import.meta.url), 'utf8');
    const chart = readFileSync(
      new URL('../src/features/market-detail/MarketPriceLightweightChart.tsx', import.meta.url),
      'utf8',
    );
    expect(tokens).toContain('--color-market-up');
    expect(tokens).toContain('--color-market-down');
    expect(base).not.toMatch(/\.(market-positive|market-negative|status-positive)\s*\{/);
    expect(base).not.toContain('--chart-2: var(--color-market-up)');
    expect(base).not.toContain('--chart-3: var(--color-market-down)');
    expect(chart).toContain("cssColor('--color-market-up'");
    expect(chart).toContain("cssColor('--color-market-down'");
    expect(chart).toContain("'data-market-color-scheme'");
  });

  it('保留主题 switch，并在收起侧栏时纵向居中排列两个入口', () => {
    const shell = readFileSync(new URL('../src/app/AppShell.tsx', import.meta.url), 'utf8');
    const menu = readFileSync(
      new URL('../src/components/market-color-menu.tsx', import.meta.url),
      'utf8',
    );
    const base = readFileSync(new URL('../src/styles/base.css', import.meta.url), 'utf8');

    expect(shell).toContain('<ThemeToggle />');
    expect(shell).toContain("sidebarCollapsed ? 'flex-col' : 'ml-auto'");
    expect(shell).toMatch(/<ThemeToggle \/>\s*<MarketColorMenu \/>/);
    expect(menu).toContain('size="icon-sm"');
    expect(base).not.toContain('.sidebar-foot .theme-switch');
  });
});
