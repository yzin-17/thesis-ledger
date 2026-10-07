import { describe, expect, it } from 'vitest';
import { upgradeArchiveNamesFor } from '../../src/platform/database-upgrade-data-witness.js';

const bars = { name: '20260929114800_drop_market_bar_series_v2' };
const policy = { name: '20260930100000_rebase_legacy_market_policy' };
const nav = { name: '20261001100000_nav_backtest_preparation' };

describe('增量升级的归档对账对象', () => {
  it('跨越两次归档时保留旧事实与 Policy 的对账目标', () => {
    expect(upgradeArchiveNamesFor([bars, policy, nav])).toEqual({
      MarketBarSeriesCoverage: 'MarketBarSeriesCoverageArchive',
      MarketBarSeriesFact: 'MarketBarSeriesFactArchive',
      DesiredProviderPolicy: 'DesiredProviderPolicyLegacyArchive',
      DesiredProviderPolicyRevision: 'DesiredProviderPolicyRevisionLegacyArchive',
    });
  });

  it('从两次归档之间出发，不再把当前行情表映射回旧归档', () => {
    expect(upgradeArchiveNamesFor([policy, nav])).toEqual({
      DesiredProviderPolicy: 'DesiredProviderPolicyLegacyArchive',
      DesiredProviderPolicyRevision: 'DesiredProviderPolicyRevisionLegacyArchive',
    });
  });

  it('仅新增 NAV 表或无增量时，所有既有表继续在原表对账', () => {
    expect(upgradeArchiveNamesFor([nav])).toEqual({});
    expect(upgradeArchiveNamesFor([])).toEqual({});
  });
});
