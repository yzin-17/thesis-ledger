import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { reportMetadataRequestSchema } from '@thesis-ledger/schemas';
import type { DsaClient } from '../src/integration/dsa/dsa.client.js';
import { readReportMetadata } from '../src/integration/dsa/dsa-report-metadata.js';

const dsaRoot = fileURLToPath(new URL('../../../../daily-stock-analysis/', import.meta.url));
const python = `${dsaRoot}.venv/bin/python`;
const request = reportMetadataRequestSchema.parse({
  contractVersion: 3, consumer: 'thesis-ledger', requestId: 'report-error-contract',
  symbol: '600519.SH', page: 1, pageSize: 2, requestBudgetMs: 3000,
});

describe('研报实际 Python 错误响应与 Server 严格解析', () => {
  it.skipIf(!existsSync(python))('来源失败保留实际语义及请求标识，避免被遮成无效信封', async () => {
    const code = `
import json
from types import SimpleNamespace
from unittest.mock import Mock
from fastapi import FastAPI
from fastapi.testclient import TestClient
from api.thesis_ledger_auth import require_contract_token
from api.thesis_ledger_report_metadata import build_report_metadata_router
from src.services.thesis_ledger_provider_runtime import ProviderCallError
body = {'contractVersion': 3, 'consumer': 'thesis-ledger', 'requestId': 'report-error-contract',
        'symbol': '600519.SH', 'page': 1, 'pageSize': 2, 'requestBudgetMs': 3000}
results = []
for code in ['upstream_failure', 'invalid_response', 'permission_denied', 'authentication_failed', 'invalid_request']:
    service = SimpleNamespace(execute_request=Mock(side_effect=ProviderCallError(code, 'synthetic-private-message')))
    app = FastAPI()
    app.dependency_overrides[require_contract_token] = lambda: None
    app.include_router(build_report_metadata_router(lambda: service))
    with TestClient(app) as client:
        result = client.post('/market/research-report-metadata', json=body)
    results.append({'sourceCode': code, 'status': result.status_code, 'payload': result.json()})
print('REPORT_ERROR_RESULTS=' + json.dumps(results))
`;
    const output = execFileSync(python, ['-B', '-c', code], { cwd: dsaRoot, encoding: 'utf8', timeout: 12_000 });
    const marker = output.split('\n').find((line) => line.startsWith('REPORT_ERROR_RESULTS='));
    expect(marker).toBeDefined();
    const results = JSON.parse(marker!.slice('REPORT_ERROR_RESULTS='.length)) as {
      sourceCode: string; status: number; payload: unknown;
    }[];
    const expected: Record<string, string> = {
      upstream_failure: 'unavailable', invalid_response: 'invalid-response', permission_denied: 'permission-denied',
      authentication_failed: 'source-authentication-failed', invalid_request: 'invalid-request',
    };
    expect(results).toHaveLength(5);
    for (const result of results) {
      const post = vi.fn(async (_path: string, _body: unknown, _attempts: number,
        mapper: (status: number, payload: unknown) => Error) => { throw mapper(result.status, result.payload); });
      await expect(readReportMetadata({ post } as unknown as Pick<DsaClient, 'post'>, request))
        .rejects.toMatchObject({ code: expected[result.sourceCode] });
      expect(post).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(result.payload)).not.toContain('synthetic-private-message');
    }
  }, 15_000);
});
