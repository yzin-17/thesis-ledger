import { useState, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router';
import { ArenaLivePerformance } from '../src/features/model-arena/ArenaLivePerformance.js';
import { ArenaWeekReport } from '../src/features/model-arena/ArenaWeekReport.js';
import {
  JournalWindowTimeInput,
  journalInstant,
} from '../src/features/journal/review/JournalWindowTimeInput.js';
import { Input } from '../src/components/ui/input.js';
import { Button } from '../src/components/ui/button.js';
import '../src/ui/styles.css';

declare global {
  interface Window {
    regressionFixture: {
      live: ComponentProps<typeof ArenaLivePerformance>['detail'];
      weekly: ComponentProps<typeof ArenaWeekReport>['report'];
    };
  }
}

function Sample() {
  const [at, setAt] = useState('2026-10-20T00:00:00.123Z');
  const [submitted, setSubmitted] = useState('');
  const [selected, setSelected] = useState('');
  const location = useLocation();
  return (
    <main className="mx-auto grid min-w-0 max-w-7xl gap-8 p-4 sm:p-6">
      <section className="grid min-w-0 gap-4" aria-label="时间精度样本">
        <h1 className="text-xl font-semibold">回归验证样本</h1>
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(journalInstant(String(new FormData(event.currentTarget).get('at'))));
          }}
        >
          <JournalWindowTimeInput
            name="at"
            aria-label="时间边界"
            value={at}
            onValueChange={setAt}
          />
          <Input aria-label="备注" defaultValue="原备注" />
          <Button type="submit">提交样本</Button>
        </form>
        <output aria-label="提交时间">{submitted}</output>
      </section>
      <ArenaLivePerformance
        detail={window.regressionFixture.live}
        onSelect={setSelected}
        onOpenDecision={setSelected}
      />
      <output aria-label="选中模型">{selected}</output>
      <ArenaWeekReport
        report={window.regressionFixture.weekly}
        arenaId="controlled-arena"
        back={{ arenaReturn: '/arena' }}
      />
      <output aria-label="导航位置">{location.pathname + location.search}</output>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <MemoryRouter>
    <Sample />
  </MemoryRouter>,
);
