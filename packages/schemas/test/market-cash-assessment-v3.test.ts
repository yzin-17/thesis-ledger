import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { marketKnownCashExchangeV3Schema } from '../src/market-known-cash-wire-v3.js';

function sample() {
  const value = JSON.parse(
    readFileSync(
      new URL('../fixtures/market-known-cash-v3.exchange.json', import.meta.url),
      'utf8',
    ),
  );
  value.request.researchPolicy.uncertainRecords = 'exclude';
  value.response.researchPolicy.uncertainRecords = 'exclude';
  const record = value.response.records[0];
  Object.assign(record, {
    sourceStatus: '2',
    normalizedStatus: 'unknown',
    statusBasis: 'unverified',
    planStatus: 'unknown',
    issues: ['UNKNOWN_DIVIDEND_STATUS'],
  });
  value.response.assessment = {
    version: 'cash-record-assessment-v1',
    responseComplete: true,
    transportCountVerified: true,
    historicalCoverageVerified: false,
    rawItemCount: 2,
    counts: { usable: 1, excluded: 1, duplicate: 0, 'outside-window': 0, placeholder: 0 },
    observations: [
      {
        rowIndex: 0,
        sourceStatus: '2',
        normalizedStatus: 'unknown',
        sourceAmount: record.sourceAmount.value,
        amountPerFundUnit: record.amountPerFundUnit,
        currency: 'CNY',
        identityBasis: 'request-bound',
        currencyBasis: 'explicit-research-scope',
        announcementDate: record.announcementDate,
        recordDate: record.recordDate,
        effectiveDate: record.effectiveDate,
        paymentDate: record.paymentDate,
        issues: ['UNKNOWN_DIVIDEND_STATUS'],
        disposition: 'usable',
      },
      {
        rowIndex: 1,
        sourceStatus: '取消',
        normalizedStatus: 'cancelled',
        sourceAmount: null,
        amountPerFundUnit: null,
        currency: 'CNY',
        identityBasis: 'request-bound',
        currencyBasis: 'explicit-research-scope',
        announcementDate: null,
        recordDate: null,
        effectiveDate: null,
        paymentDate: null,
        issues: ['NON_IMPLEMENTED_PLAN'],
        disposition: 'excluded',
      },
    ],
    rawBusinessResponse: '{"code":0,"data":{"item":[]}}',
  };
  return value;
}

describe('保留未知的标准分红资料', () => {
  it('缺公告日及来源状态保持null；不能省略缺失问题或伪造明确状态', () => {
    const value = sample();
    Object.assign(value.response.records[0], {
      announcementDate: null,
      sourceStatus: null,
      sourcePlanStatus: null,
      issues: ['MISSING_DIVIDEND_STATUS', 'UNKNOWN_DIVIDEND_STATUS', 'MISSING_ANNOUNCEMENT_DATE'],
    });
    expect(
      marketKnownCashExchangeV3Schema.parse(value).response.records[0]!.announcementDate,
    ).toBeNull();
    value.response.records[0].issues = ['UNKNOWN_DIVIDEND_STATUS'];
    expect(marketKnownCashExchangeV3Schema.safeParse(value).success).toBe(false);
  });
  it('原进度包含空白时也原样保留，不改变不透明来源值', () => {
    const value = sample();
    value.response.records[0].sourceStatus = ' 2 ';
    value.response.records[0].sourcePlanStatus = ' 2 ';
    const record = marketKnownCashExchangeV3Schema.parse(value).response.records[0]!;
    expect(record.sourceStatus).toBe(' 2 ');
    expect(record.sourcePlanStatus).toBe(' 2 ');
  });
  const dsaRoot = fileURLToPath(new URL('../../../../daily-stock-analysis/', import.meta.url));
  it.skipIf(!existsSync(`${dsaRoot}/.venv/bin/python`))('东财缺字段输出与标准合同一致', () => {
    const code = `import json
from tests.test_eastmoney_dividend_research_records import request, page, snapshot
from src.services.thesis_ledger_eastmoney_known_cash import read_eastmoney_known_cash
r = request()
value = read_eastmoney_known_cash(r, snapshot(), fetch=lambda _: page())
value['source']['controlIdentity'] = {'providerConfigVersion':3,'credentialRevision':'not-required'}
print(json.dumps({'request':r,'response':{**r,**value,'fetchedAt':r['dataAsOf']}}))`;
    const exchange = JSON.parse(
      execFileSync(`${dsaRoot}/.venv/bin/python`, ['-c', code], { cwd: dsaRoot, encoding: 'utf8' }),
    );
    expect(marketKnownCashExchangeV3Schema.parse(exchange).response.records[0]!.statusBasis).toBe(
      'event-reconciled',
    );
  });
  it.skipIf(!existsSync(`${dsaRoot}/.venv/bin/python`))(
    'DSA实际新规范化输出与主仓合同逐字段一致',
    () => {
      const code = `import json
from tests.test_hithink_dividend_research_records import request, source, snapshot
from src.services.thesis_ledger_hithink_known_cash import read_hithink_known_cash
from tests.test_thesis_ledger_hithink_known_cash import EXCHANGE
r = request()
value = read_hithink_known_cash(r, snapshot(), fetch=lambda *a, **k: source())
value['source']['controlIdentity'] = EXCHANGE['response']['source']['controlIdentity']
print(json.dumps({'request':r,'response':{**r,**value,'fetchedAt':EXCHANGE['response']['fetchedAt']}}))`;
      const exchange = JSON.parse(
        execFileSync(`${dsaRoot}/.venv/bin/python`, ['-c', code], {
          cwd: dsaRoot,
          encoding: 'utf8',
        }),
      );
      expect(marketKnownCashExchangeV3Schema.parse(exchange).response.records[0]!.statusBasis).toBe(
        'event-reconciled',
      );
    },
  );
  it('未知记录、未采用取消行及原业务响应都可交换，传输和覆盖分列', () => {
    const parsed = marketKnownCashExchangeV3Schema.parse(sample());
    expect(parsed.response.records[0]!.normalizedStatus).toBe('unknown');
    expect(parsed.response.assessment!.counts.excluded).toBe(1);
    expect(parsed.response.assessment!.historicalCoverageVerified).toBe(false);
  });
  it.each(['counts', 'coverage', 'status', 'reference', 'missing-quality'])(
    '%s篡改拒绝',
    (kind) => {
      const value = sample();
      if (kind === 'counts') value.response.assessment.counts.excluded = 0;
      if (kind === 'coverage') value.response.assessment.historicalCoverageVerified = true;
      if (kind === 'status') value.response.records[0].planStatus = 'implementation-plan-announced';
      if (kind === 'reference') value.response.records[0].statusBasis = 'event-reconciled';
      if (kind === 'missing-quality') delete value.response.assessment;
      expect(marketKnownCashExchangeV3Schema.safeParse(value).success).toBe(false);
    },
  );
});
