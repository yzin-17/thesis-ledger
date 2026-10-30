import assert from 'node:assert/strict';
import test from 'node:test';
import { aiCatalogBoundaryViolation } from './ai-catalog-boundaries.mjs';

const file = 'apps/server/src/ai/ai-provider-model-catalog-source.ts';
test('用户配置与标准协议分支允许通过', () => {
  assert.equal(
    aiCatalogBoundaryViolation(file, 'new URL(config.url).origin === new URL(baseUrl).origin'),
    null,
  );
  assert.equal(aiCatalogBoundaryViolation(file, "format === 'anthropic-messages'"), null);
});
test('拒绝内置目录来源地址', () => {
  assert.match(
    aiCatalogBoundaryViolation(file, "const endpoint = 'https://catalog.example/models'"),
    /用户配置/u,
  );
});
test('拒绝按提供方来源和名称选择目录规则', () => {
  for (const key of ['hostname', 'host', 'origin', 'providerName', 'providerId', 'name']) {
    assert.match(
      aiCatalogBoundaryViolation(file, `if (input.${key} === 'source') useAdapter()`),
      /分支/u,
    );
  }
});
test('测试数据及其他功能模块不属于目录执行限制', () => {
  assert.equal(
    aiCatalogBoundaryViolation(
      'apps/server/test/ai/catalog.test.ts',
      "const origin = 'https://catalog.example'",
    ),
    null,
  );
  assert.equal(
    aiCatalogBoundaryViolation(
      'apps/server/src/market/catalog.ts',
      "const origin = 'https://catalog.example'",
    ),
    null,
  );
});
