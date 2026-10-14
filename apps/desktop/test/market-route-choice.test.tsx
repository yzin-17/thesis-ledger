import { describe, expect, it } from 'vitest';
import {
  selectableRouteTargetsV3,
  readyRouteTargetsV3,
} from '../src/features/market-data/market-data-routes-v3.js';
import { catalog, key, provider, target } from './market-policy-defaults.fixture.js';

describe('路由候选与执行状态分离', () => {
  it.each(['dependency_missing', 'not_admitted', 'quota_unavailable'] as const)(
    '%s 来源仍可作为主备选择，并展示状态',
    (state) => {
      const current = { ...catalog, entries: [{ key, target, state }] };
      const options = selectableRouteTargetsV3(current, key, [provider]);
      expect(options).toHaveLength(1);
      expect(options[0]!.target).toEqual(target);
      expect(options[0]!.label).toContain('HiThink');
      expect(options[0]!.disabled).toBe(false);
      expect(readyRouteTargetsV3(current, key, [provider])).toEqual([]);
    },
  );
  it('缺凭证保留选项及原因，但禁止选择', () => {
    const current = {
      ...catalog,
      entries: [{ key, target, state: 'credential_missing' as const }],
    };
    const [option] = selectableRouteTargetsV3(current, key, [provider]);
    expect(option?.disabled).toBe(true);
    expect(option?.label).toContain('凭据缺失');
    expect(option?.target).toEqual(target);
  });
  it('凭证刚清除、目录尚未刷新时仍禁选，恢复配置后重新可选', () => {
    const missing = { ...provider, enabled: false, credentialConfigured: false };
    const [option] = selectableRouteTargetsV3(catalog, key, [missing]);
    expect(option?.disabled).toBe(true);
    expect(option?.label).toContain('凭据缺失');
    expect(selectableRouteTargetsV3(catalog, key, [provider])[0]?.disabled).toBe(false);
  });
  it('免凭证来源不会因凭证字段为空被禁选', () => {
    const publicProvider = { ...provider, requiresCredential: false, credentialConfigured: false };
    expect(selectableRouteTargetsV3(catalog, key, [publicProvider])[0]?.disabled).toBe(false);
  });
  it('精确口径和目录完整性仍须匹配', () => {
    expect(selectableRouteTargetsV3(catalog, { ...key, adjustment: 'none' }, [provider])).toEqual(
      [],
    );
    expect(
      selectableRouteTargetsV3(
        { ...catalog, status: 'partial', entries: [], reason: 'catalog_partial' },
        key,
        [provider],
      ),
    ).toEqual([]);
  });
});
