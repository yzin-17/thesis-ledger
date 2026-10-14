import 'reflect-metadata';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { MarketKnownCashRequestV3 } from '@thesis-ledger/schemas';
import { BacktestKnownCashAcquisitionV3 } from '../../src/backtest/backtest-known-cash-acquisition-v3.service.js';
import { BacktestKnownCashPreparationRepository } from '../../src/backtest/backtest-known-cash-preparation.repository.js';
import { knownCashRunFixture } from './known-cash-test-fixtures.js';
import { createHash } from 'node:crypto';

describe('现金取得编排与Server原包授信', () => {
  it('正常能力读取按保存顺序和价格版本取得并保存；版本变化不读供应商或保存空包', async () => {
    const root = await mkdtemp(join(tmpdir(), 'known-acquisition-'));
    try {
      const f = await knownCashRunFixture();
      const exchange = f.prepared.acquisition.exchange;
      const target = exchange.request.routeTarget;
      const effective = {
        contractVersion: 3,
        consumer: 'thesis-ledger',
        requestId: 'policy',
        revision: 1,
        sourceDesiredRevision: 1,
        enabled: true,
        appliedAt: '2026-10-09T12:00:00Z',
        routes: [
          {
            key: exchange.request.routeKey,
            reason: 'not_admitted',
            targets: [{ ...target, eligible: false, reason: 'not_admitted' }],
          },
        ],
      };
      const catalog = {
        contractVersion: 3,
        consumer: 'thesis-ledger',
        catalogRevision: 1,
        generatedAt: '2026-10-09T12:00:00Z',
        integrity: 'complete',
        entries: [
          {
            key: exchange.request.routeKey,
            target: { providerId: target.providerId, upstreamSource: target.upstreamSource },
            state: 'not_admitted',
          },
        ],
      };
      const record = {
        ...exchange.response.records[0]!,
        sourceStatus: '2',
        normalizedStatus: 'unknown' as const,
        statusBasis: 'unverified' as const,
        planStatus: 'unknown' as const,
        issues: ['UNKNOWN_DIVIDEND_STATUS'],
      };
      const rawBusinessResponse =
        '{"code":0,"data":{"item":[{"progress":"2","per_ten_cash_before_tax":0.88}]}}';
      const assessment = {
        version: 'cash-record-assessment-v1' as const,
        responseComplete: true as const,
        transportCountVerified: true,
        historicalCoverageVerified: false as const,
        rawItemCount: 1,
        counts: { usable: 1, excluded: 0, duplicate: 0, 'outside-window': 0, placeholder: 0 },
        observations: [
          {
            rowIndex: 0,
            sourceStatus: '2',
            normalizedStatus: 'unknown' as const,
            sourceAmount: record.sourceAmount.value,
            amountPerFundUnit: record.amountPerFundUnit,
            currency: 'CNY' as const,
            identityBasis: 'request-bound' as const,
            currencyBasis: 'explicit-research-scope' as const,
            announcementDate: record.announcementDate,
            recordDate: record.recordDate,
            effectiveDate: record.effectiveDate,
            paymentDate: record.paymentDate,
            issues: record.issues,
            disposition: 'usable' as const,
          },
        ],
        rawBusinessResponse,
      };
      const knownCash = vi.fn(async (request: MarketKnownCashRequestV3) => ({
        ...exchange.response,
        ...request,
        source: {
          ...exchange.response.source,
          responseSha256: createHash('sha256').update(rawBusinessResponse).digest('hex'),
        },
        records: [record],
        assessment,
      }));
      const dsa = {
        marketRouteCatalogV3: vi.fn(async () => catalog),
        dataCapabilities: { knownCash },
      };
      const control = { getPolicy: vi.fn(async () => ({ effectiveProjection: effective })) };
      const originals = new BacktestKnownCashPreparationRepository(root);
      const service = new BacktestKnownCashAcquisitionV3(dsa as never, control as never, originals);
      const c = f.runConfig;
      const request = {
        contractVersion: 3 as const,
        requestId: 'intent',
        strategyVersionId: '11111111-1111-4111-8111-111111111111',
        adjustment: 'none' as const,
        accountingBasis: 'raw-events' as const,
        history: { basis: 'fixed-provider-snapshot' as const },
        freezeTimePolicy: 'after-acquisition' as const,
        cashEventResearch: 'ex-date-entitlement-payment-date-cash-v1' as const,
        knownCashResearch: f.prepared.input.policy,
        runConfig: {
          startDate: c.startDate,
          endDate: c.endDate,
          dataAsOf: c.dataAsOf,
          baseCurrency: c.baseCurrency,
          initialCash: c.initialCash,
          valuationPolicy: c.valuationPolicy,
          executionModel: c.executionModel!,
        },
      };
      const input = {
        request,
        executionPriceProtocol: c.executionPriceProtocol,
        revisions: f.prepared.input.revisions,
      };
      const prepared = await service.acquire(input);
      expect(await originals.assertOriginal(prepared)).toEqual(prepared);
      expect(prepared.input.coverage.complete).toBe(false);
      expect(prepared.input.policy.uncertainRecords).toBe('exclude');
      expect(prepared.input.policy.entitlement).toBe('cn-etf-record-close-holdings-v2');
      expect(prepared.input.records[0]!.normalizedStatus).toBe('unknown');
      expect(prepared.acquisition.clock.mode).toBe('after-acquisition');
      expect(knownCash).toHaveBeenCalledWith(
        expect.objectContaining({ routeTarget: target, ...f.prepared.input.revisions }),
      );
      const knownCashControl = vi.fn(async () => ({ status: 'verified' }));
      Object.assign(dsa.dataCapabilities, { knownCashControl });
      knownCash.mockClear();
      const reused = await service.acquire({
        ...input,
        request: {
          ...request,
          reuseResearchData: {
            executionWindow: c.frozenExecutionWindow!,
            cashPreparationHash: prepared.contentHash,
          },
        },
      });
      expect(reused).toEqual(prepared);
      expect(knownCash).not.toHaveBeenCalled();
      expect(knownCashControl).toHaveBeenCalledOnce();
      await expect(
        service.acquire({
          ...input,
          request: {
            ...request,
            runConfig: { ...request.runConfig, endDate: '2025-06-24' },
            reuseResearchData: {
              executionWindow: c.frozenExecutionWindow!,
              cashPreparationHash: prepared.contentHash,
            },
          },
        }),
      ).rejects.toThrow('范围');
      expect(knownCash).not.toHaveBeenCalled();
      knownCash.mockClear();
      effective.revision = 2;
      await expect(service.acquire(input)).rejects.toThrow('policy_mismatch');
      expect(knownCash).not.toHaveBeenCalled();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
