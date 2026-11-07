import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '../src/components/ui/button';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog';
import { Toaster } from '../src/components/ui/toast';
import { RiskRuleEditorSheet } from '../src/features/risk/RiskRuleEditorSheet';
import { precisionRiskRule, riskAccount, riskPosition } from './risk-threshold.fixture';
import type { CreateRiskRuleInput } from '../src/features/risk/risk.types';
import '../src/ui/styles.css';

declare global {
  interface Window {
    riskThresholdHarness?: {
      original: number;
      submissions: CreateRiskRuleInput[];
      failNext: () => void;
    };
  }
}
function Harness() {
  const [open, setOpen] = useState(false);
  const [state] = useState(() => {
    const scenario = new URLSearchParams(window.location.search).get('case');
    let threshold = 1 / 3;
    if (scenario === 'tiny') threshold = 1e-9;
    else if (scenario === 'minimum') threshold = Number.MIN_VALUE;
    return {
      rule: precisionRiskRule(threshold),
      submissions: [] as CreateRiskRuleInput[],
      fail: false,
    };
  });
  useEffect(() => {
    window.riskThresholdHarness = {
      original: state.rule.threshold,
      submissions: state.submissions,
      failNext: () => {
        state.fail = true;
      },
    };
    return () => {
      delete window.riskThresholdHarness;
    };
  }, [state]);
  return (
    <main className="flex flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">风险阈值精度验收</h1>
      <Button onClick={() => setOpen(true)}>编辑规则</Button>
      <RiskRuleEditorSheet
        open={open}
        onOpenChange={setOpen}
        rule={state.rule}
        accounts={[riskAccount]}
        positions={[riskPosition]}
        pending={false}
        onSubmit={async (input) => {
          state.submissions.push(input);
          if (state.fail) {
            state.fail = false;
            return false;
          }
          return true;
        }}
      />
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <Toaster>
    <ConfirmDialogProvider>
      <Harness />
    </ConfirmDialogProvider>
  </Toaster>,
);
