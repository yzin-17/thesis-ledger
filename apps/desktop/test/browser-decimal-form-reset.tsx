import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '../src/components/ui/button';
import { DecimalInput } from '../src/components/ui/decimal-input';
import { InputGroup } from '../src/components/ui/input-group';
import { PositionFields } from '../src/features/portfolio/PortfolioPositionFields';
import { drawerPosition } from './browser-drawer-samples';
import '../src/ui/styles.css';

const formId = 'decimal-reset-owner';
const nextDefault = '3.456789012345678901';
type HarnessState = {
  scenario: string;
  original: Record<string, string>;
  nextDefault: string;
  changes: number;
  resets: number;
  read: () => Record<string, string>;
};
declare global {
  interface Window {
    decimalResetHarness?: HarnessState;
  }
}

function Harness() {
  const scenario = new URLSearchParams(window.location.search).get('case') ?? 'ordinary';
  let initial = '1.2222222222222223';
  if (scenario === 'external') initial = '9007199254740993.125';
  else if (scenario === 'cancel') initial = '0.' + '0'.repeat(350) + '1';
  else if (scenario === 'controlled') initial = '0';
  else if (scenario === 'latest-default') initial = '';
  const [seed, setSeed] = useState(initial);
  const [controlled, setControlled] = useState(initial);
  const [sample] = useState(() => ({
    ...drawerPosition,
    quantity: 1.2222222222222223,
    costPrice: 4.123456789012345,
  }));
  const [state] = useState<HarnessState>(() => ({
    scenario,
    original:
      scenario === 'position'
        ? { quantity: String(sample.quantity), costPrice: String(sample.costPrice) }
        : { amount: initial },
    nextDefault,
    changes: 0,
    resets: 0,
    read: () =>
      Object.fromEntries(
        new FormData(document.getElementById(formId) as HTMLFormElement),
      ) as Record<string, string>,
  }));
  useEffect(() => {
    window.decimalResetHarness = state;
    return () => {
      delete window.decimalResetHarness;
    };
  }, [state]);
  const external = scenario === 'external';
  let control = (
    <InputGroup>
      <DecimalInput
        grouped
        name="amount"
        aria-label="数值"
        form={external ? formId : undefined}
        defaultValue={seed}
        value={scenario === 'controlled' ? controlled : undefined}
        onChange={(event) => {
          if (scenario === 'controlled') setControlled(event.target.value);
        }}
      />
    </InputGroup>
  );
  if (scenario === 'position') {
    control = (
      <PositionFields
        editing={sample}
        instrumentQuery=""
        instrumentResults={[]}
        instrumentSearchState="idle"
        instrumentSearchBusy={false}
        instrumentSearchOpen={false}
        selectedInstrument={null}
        manualInstrumentEntry={false}
        manualAssetType="stock"
        setInstrumentSearchOpen={() => {}}
        handleInstrumentQueryChange={() => {}}
        confirmInstrument={async () => {}}
        clearInstrumentSelection={() => {}}
        startManualInstrumentEntry={() => {}}
        setManualAssetType={() => {}}
      />
    );
  }
  return (
    <main
      className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6"
      onChange={() => {
        state.changes += 1;
      }}
    >
      <h1 className="text-xl font-semibold">数值输入原生表单验收</h1>
      <section className="space-y-4 rounded-xl border bg-card p-4">
        <form
          id={formId}
          className="space-y-4"
          onReset={(event) => {
            state.resets += 1;
            if (scenario === 'cancel') event.preventDefault();
            if (scenario === 'latest-default') setSeed(nextDefault);
          }}
        >
          {!external && control}
        </form>
        {external && control}
        <Button type="reset" form={formId}>
          重置输入
        </Button>
      </section>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);
