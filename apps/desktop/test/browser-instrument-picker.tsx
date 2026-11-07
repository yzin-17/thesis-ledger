import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InstrumentSymbolField } from '../src/features/market-data/InstrumentSymbolField.js';
import { InstrumentOptionField } from '../src/features/market-data/InstrumentOptionField.js';
import { Button } from '../src/components/ui/button.js';
import { Field, FieldGroup, FieldLabel } from '../src/components/ui/field.js';
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetBody,
  SheetFooter,
} from '../src/components/ui/sheet.js';
import '../src/ui/styles.css';
function Fixture() {
  const [value, setValue] = useState('');
  const [holding, setHolding] = useState('');
  const [open, setOpen] = useState(false);
  return (
    <main className="p-6">
      <h1>受控样本：基金代码搜索</h1>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger render={<Button />}>新建基金定投样本</SheetTrigger>
        <SheetContent size="form" side="right">
          <SheetHeader>
            <SheetTitle>基金定投输入验收</SheetTitle>
          </SheetHeader>
          <SheetBody>
            <FieldGroup>
              <Field>
                <FieldLabel>基金代码</FieldLabel>
                <InstrumentSymbolField
                  aria-label="基金代码"
                  value={value}
                  onChange={setValue}
                  markets={['OF']}
                  instrumentTypes={['MUTUAL_FUND']}
                />
              </Field>
              <Field>
                <FieldLabel>实际持仓</FieldLabel>
                <InstrumentOptionField
                  label="实际持仓"
                  value={holding}
                  onChange={setHolding}
                  options={[
                    { value: '600519.SH', label: '贵州茅台 · 600519.SH' },
                    { value: 'AAPL.US', label: '苹果公司 · AAPL.US' },
                  ]}
                />
              </Field>
              <output aria-label="待提交代码">{value}</output>
            </FieldGroup>
          </SheetBody>
          <SheetFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient()}>
    <Fixture />
  </QueryClientProvider>,
);
