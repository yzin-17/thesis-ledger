import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { AllocationWeight } from '../src/features/performance/AllocationWeight';
import '../src/ui/styles.css';

const values: Record<string, number | null> = {
  ordinary: 1 / 3,
  rounding: 0.01005,
  small: 1e-9,
  negative: -1e-9,
  minimum: Number.MIN_VALUE,
  maximum: Number.MAX_VALUE,
  above: 2.25,
  zero: 0,
  unavailable: null,
};
const scenario = new URLSearchParams(window.location.search).get('case') ?? 'ordinary';
if (!(scenario in values)) throw new Error('未知的比例验收样本');
const value = values[scenario]!;
function Harness() {
  useEffect(() => {
    document.documentElement.dataset.ratioReady = scenario;
  }, []);
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <h1 className="text-xl font-semibold">双端只读比例展示验收</h1>
      <section className="space-y-4 rounded-xl border bg-card p-4" data-desktop-ratio="">
        <h2 className="text-xl">Desktop 资产权重</h2>
        <AllocationWeight value={value} label="股票权重" unavailable={scenario === 'unavailable'} />
      </section>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);
