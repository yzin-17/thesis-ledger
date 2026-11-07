import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog';
import { Toaster } from '../src/components/ui/toast';
import { PerformanceTargetEditor } from '../src/features/performance/PerformanceTargetEditor';
import '../src/ui/styles.css';

declare global {
  interface Window {
    allocationTargetHarness?: {
      original: Record<string, number>;
      submissions: Record<string, number>[];
      failNext: () => void;
    };
  }
}

function Harness() {
  const [error, setError] = useState<string | null>(null);
  const scenario = new URLSearchParams(window.location.search).get('case');
  const [state] = useState(() => {
    let original: Record<string, number>;
    if (scenario === 'tiny') original = { stock: 1e-9, cash: 1 };
    else if (scenario === 'minimum') original = { stock: Number.MIN_VALUE, cash: 1 };
    else original = { stock: 1 / 3, etf: 1 / 3, cash: 1 / 3 };
    return {
      original,
      submissions: [] as Record<string, number>[],
      fail: false,
    };
  });
  useEffect(() => {
    window.allocationTargetHarness = {
      original: state.original,
      submissions: state.submissions,
      failNext: () => {
        state.fail = true;
      },
    };
    return () => {
      delete window.allocationTargetHarness;
    };
  }, [state]);
  return (
    <main className="flex flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">配置目标精度验收</h1>
      <PerformanceTargetEditor
        label="编辑目标"
        scopeLabel="受控组合"
        categories={[]}
        targets={state.original}
        saving={false}
        disabled={false}
        error={error}
        onBeginEdit={() => setError(null)}
        onSave={async (targets) => {
          state.submissions.push(targets);
          if (state.fail) {
            state.fail = false;
            setError('受控保存失败，请保留输入后重试。');
            return false;
          }
          setError(null);
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
