import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ProviderCredentialFields } from '../src/features/market-data/ProviderCredentialFields.js';
import {
  canRetainCredentialField,
  validateCredentialDraft,
  providerTestMessage,
} from '../src/features/market-data/provider-credentials.js';
import {
  clearMarketProviderCredential,
  saveMarketProviderCredentials,
  testMarketProvider,
} from '../src/features/market-data/market-data.api.js';
import type { ProviderManifest } from '../src/features/market-data/market-data.types.js';
import { safeOAuthUrl } from '../src/features/market-data/provider-oauth.api.js';

const request = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock('../src/shared/api/client.js', () => ({ getDesktopApiClient: () => ({ request }) }));

const provider: ProviderManifest = {
  providerId: 'longbridge',
  displayName: 'Longbridge',
  version: 1,
  enabled: false,
  configured: true,
  credentialConfigured: true,
  requiresCredential: true,
  capabilities: {},
  credentialSource: 'control',
  credentialMethod: 'legacy',
  credentialFieldsConfigured: { appKey: true, appSecret: true, accessToken: true },
  credentialSchema: {
    methods: [
      {
        method: 'legacy',
        fields: ['appKey', 'appSecret', 'accessToken'].map((name) => ({
          name,
          secret: true,
          required: true,
        })),
      },
    ],
  },
};

describe('页面凭证配置', () => {
  it('只打开官方授权地址，模拟或未执行测试不显示成功', () => {
    expect(
      safeOAuthUrl('https://openapi.longbridge.com/oauth2/authorize?state=fixture'),
    ).not.toBeNull();
    for (const url of [
      'javascript:alert(1)',
      'https://example.com/oauth2/authorize',
      'https://openapi.longbridge.com@evil.example/oauth2/authorize',
      'http://openapi.longbridge.com/oauth2/authorize',
    ])
      expect(safeOAuthUrl(url)).toBeNull();
    expect(
      providerTestMessage({
        status: 'healthy',
        capabilityResults: {
          DAILY_BAR: { status: 'healthy', attempted: false, errorCode: 'fixture_mode' },
        },
      }).error,
    ).toBe(true);
    expect(
      providerTestMessage({
        status: 'healthy',
        capabilityResults: { DAILY_BAR: { status: 'healthy', attempted: true } },
      }).error,
    ).toBe(false);
    expect(
      providerTestMessage({
        status: 'healthy',
        capabilityResults: { DAILY_BAR: { status: 'healthy' } },
      }).error,
    ).toBe(true);
    expect(
      providerTestMessage({
        status: 'degraded',
        capabilityResults: {
          DAILY_BAR: { status: 'failed', attempted: true, errorCode: 'rate_limited' },
        },
      }).text,
    ).toContain('请求频率受限');
  });

  it('草稿测试转发结构化字段和取消信号，不写配置接口', async () => {
    const controller = new AbortController();
    const draft = { method: 'legacy', values: { appKey: 'draft-only' } };
    await testMarketProvider(provider, draft, controller.signal);
    expect(request).toHaveBeenLastCalledWith('/api/v2/market-data/providers/longbridge/test', {
      method: 'POST',
      body: JSON.stringify({ credentials: draft }),
      signal: controller.signal,
    });
  });
  it('同方式可保留页面字段，环境和其他方式必须重新填写', () => {
    expect(
      validateCredentialDraft(provider, {
        method: 'legacy',
        values: { accessToken: 'replacement' },
      }),
    ).toBeNull();
    expect(
      canRetainCredentialField(
        { ...provider, credentialSource: 'environment' },
        'legacy',
        'appKey',
      ),
    ).toBe(false);
    expect(
      validateCredentialDraft(
        { ...provider, credentialSource: 'environment' },
        { method: 'legacy', values: {} },
      ),
    ).toContain('App Secret');
    expect(
      validateCredentialDraft(
        { ...provider, credentialMethod: 'oauth' },
        { method: 'legacy', values: {} },
      ),
    ).toContain('Access Token');
    expect(validateCredentialDraft(provider, { method: 'unknown', values: {} })).not.toBeNull();
  });

  it('密钥字段使用密码输入与独立可访问标签，不生成默认标签激活', () => {
    const html = renderToStaticMarkup(
      <ProviderCredentialFields
        provider={provider}
        draft={{ method: 'legacy', values: {} }}
        disabled={false}
        onChange={vi.fn()}
      />,
    );
    expect(html.match(/type="password"/g)).toHaveLength(3);
    expect(html.match(/已保存，留空保留/g)).toHaveLength(3);
    expect(html).toContain('aria-labelledby="credential-longbridge-appSecret"');
    expect(html).not.toContain('<label');
  });

  it('保存与清除仅修改凭证，不重新启用来源或覆盖设置', async () => {
    const credentials = {
      method: 'legacy',
      values: { appKey: 'a', appSecret: 'b', accessToken: 'c' },
    };
    await saveMarketProviderCredentials('longbridge', credentials);
    expect(request).toHaveBeenLastCalledWith('/api/v2/market-data/providers/longbridge/config', {
      method: 'POST',
      body: JSON.stringify({ credentials }),
    });
    await clearMarketProviderCredential(provider);
    expect(request).toHaveBeenLastCalledWith('/api/v2/market-data/providers/longbridge/config', {
      method: 'POST',
      body: JSON.stringify({ clearCredentials: true }),
    });
  });
});
