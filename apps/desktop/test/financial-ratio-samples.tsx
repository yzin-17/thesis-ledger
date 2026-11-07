import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog';
import { TableContainer } from '../src/components/ui/table';
import {
  PerformanceAllocationSection,
  PerformanceMetrics,
} from '../src/features/performance/PerformanceSections';
import { PerformanceTrendChart } from '../src/features/performance/PerformanceTrendChart';
import {
  PortfolioPositionTable,
  PortfolioSummary,
} from '../src/features/portfolio/PortfolioOverview';
import { RiskEventRows } from '../src/features/risk/RiskSections';
import type { Portfolio } from '../src/features/portfolio/portfolio.types';

export function financialRatioSample(value: number): Portfolio {
  return {
    totalMarketValue: 1,
    totalCost: 1,
    totalPnl: 0.1,
    cashValue: 0,
    cumulativePnl: 0.1,
    cumulativePnlRatio: value,
    realizedPnl: 0.01,
    mode: 'actual',
    partial: false,
    valuedAt: '2026-11-07T00:00:00.000Z',
    dailyChange: {
      pnl: 0.1,
      returnRate: value,
      partial: false,
      missingSymbols: [],
      basis: 'PREVIOUS_CLOSE_CURRENT_HOLDINGS',
    },
    positions: [
      {
        id: 'ratio-position',
        accountId: 'ratio-account',
        symbol: '600000.SH',
        quantity: 1,
        costPrice: 1,
        marketPrice: 1,
        marketValue: Math.abs(value) > 2 ? 1 : value,
        pnl: 0.1,
        pnlRatio: value,
        dailyPnl: 0.1,
        dailyReturn: value,
        stale: false,
        asset: { name: '受控标的', assetType: 'stock' },
      },
    ],
  };
}
export function FinancialRatioSamples({ value }: { value: number }) {
  const portfolio = financialRatioSample(value);
  return (
    <ConfirmDialogProvider>
      <div className="space-y-6">
        <section data-ratio-summary="">
          <PerformanceMetrics
            latest={undefined}
            snapshotCount={2}
            summary={{ ttwror: value, xirr: value }}
          />
        </section>
        <section data-ratio-allocation="">
          <PerformanceAllocationSection
            loadState="ready"
            allocationRows={[{ category: 'stock', value: 1, weight: value }]}
            rebalanceRows={[
              {
                category: 'stock',
                currentWeight: value,
                targetWeight: value,
                weightGap: value,
                amountGap: 1,
                direction: 'increase',
              },
            ]}
            targets={{ stock: value }}
            dataQuality={{ partial: false, missingSymbols: [] }}
            valuedAt="2026-11-07T00:00:00.000Z"
            onSaveTargets={async () => {
              throw new Error('隔离只读样本不应保存');
            }}
          />
        </section>
        <section data-ratio-trend="">
          <PerformanceTrendChart
            interval="1d"
            seriesPoints={[
              {
                at: '2026-11-07T00:00:00.000Z',
                value: 100,
                currency: 'CNY',
                valuationBasis: 'OFFICIAL',
                disclosureCoverage: value,
                pricedCoverage: value,
                dataQuality: 'COMPLETE',
                sourceSnapshotId: null,
              },
            ]}
          />
        </section>
        <section data-ratio-portfolio="">
          <PortfolioSummary portfolio={portfolio} />
          <PortfolioPositionTable
            portfolio={portfolio}
            accounts={[
              {
                id: 'ratio-account',
                name: '受控账户',
                type: 'securities',
                currency: 'CNY',
                mode: 'actual',
              },
            ]}
          />
        </section>
        <section data-ratio-risk="">
          <TableContainer>
            <table>
              <tbody>
                <RiskEventRows
                  events={[
                    {
                      id: 'ratio-event',
                      ruleId: 'ratio-rule',
                      ruleVersion: 3,
                      mode: 'actual',
                      severity: 'warning',
                      message: '冻结消息：1.00% · 历史保留',
                      symbol: '600000.SH',
                      marketTime: null,
                      evaluatedAt: '2026-11-07T00:00:00.000Z',
                      context: { value, metadata: { valueMetric: 'weight' } },
                    },
                  ]}
                />
              </tbody>
            </table>
          </TableContainer>
        </section>
      </div>
    </ConfirmDialogProvider>
  );
}
