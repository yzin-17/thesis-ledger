import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { FinancialRatioSamples } from './financial-ratio-samples';
import '../src/ui/styles.css';

const values: Record<string, number> = {
  ordinary: 1 / 3,
  rounding: 0.01005,
  small: 1e-9,
  negative: -1e-9,
  minimum: Number.MIN_VALUE,
  maximum: Number.MAX_VALUE,
  zero: 0,
};
const scenario = new URLSearchParams(window.location.search).get('case') ?? 'ordinary';
if (!(scenario in values)) throw new Error('未知的读数验收样本');
function Harness() {
  useEffect(() => {
    document.documentElement.dataset.financialRatioReady = scenario;
  }, []);
  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <h1 className="mb-group text-xl font-semibold">收益、组合与风险比例验收</h1>
      <FinancialRatioSamples value={values[scenario]!} />
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);
