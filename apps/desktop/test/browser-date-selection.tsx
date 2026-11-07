import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '../src/components/ui/button.js';
import { DateInput } from '../src/components/ui/date-input.js';
import { Field, FieldGroup, FieldLabel } from '../src/components/ui/field.js';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetBody,
} from '../src/components/ui/sheet.js';
import { Dialog, DialogContent, DialogTitle, DialogHeader } from '../src/components/ui/dialog.js';
import '../src/ui/styles.css';

function DateFields() {
  const [month, setMonth] = useState('2026-11');
  const [date, setDate] = useState('2026-11-06');
  const [time, setTime] = useState('2026-11-06T12:34:56.789');
  const [submitted, setSubmitted] = useState('');
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setSubmitted(JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))));
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="sample-month">开始月份</FieldLabel>
          <DateInput
            id="sample-month"
            aria-label="开始月份"
            type="month"
            name="month"
            min="2026-01"
            max="2027-12"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="sample-date">日期</FieldLabel>
          <DateInput
            id="sample-date"
            aria-label="日期"
            type="date"
            name="date"
            min="2026-11-01"
            max="2026-12-31"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="sample-time">日期时间</FieldLabel>
          <DateInput
            id="sample-time"
            aria-label="日期时间"
            type="datetime-local"
            name="time"
            step="any"
            value={time}
            onChange={(event) => setTime(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel>禁用月份</FieldLabel>
          <DateInput aria-label="禁用月份" type="month" value="2026-11" disabled />
        </Field>
        <Field>
          <FieldLabel>只读日期</FieldLabel>
          <DateInput aria-label="只读日期" type="date" value="2026-11-06" readOnly />
        </Field>
        <Field>
          <FieldLabel>错误日期</FieldLabel>
          <DateInput aria-label="错误日期" type="date" aria-invalid defaultValue="2026-11-06" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2" aria-label="日期范围">
          <DateInput aria-label="开始日期" type="date" defaultValue="2026-11-01" />
          <DateInput aria-label="结束日期" type="date" defaultValue="2026-11-30" />
        </div>
        <Button type="submit">验证提交</Button>
        <output className="break-all text-xs" aria-label="提交内容">
          {submitted}
        </output>
      </FieldGroup>
    </form>
  );
}

function Fixture() {
  const [surface, setSurface] = useState('page');
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-xl">日期选择受控验收</h1>
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => setSurface('drawer')}>打开 Drawer</Button>
        <Button onClick={() => setSurface('dialog')}>打开对话框</Button>
        <Button
          onClick={() => {
            document.documentElement.dataset.theme =
              document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
          }}
        >
          切换主题
        </Button>
      </div>
      {surface === 'page' && <DateFields />}
      <Sheet
        open={surface === 'drawer'}
        onOpenChange={(open) => {
          if (!open) setSurface('page');
        }}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>日期 Drawer</SheetTitle>
          </SheetHeader>
          <SheetBody>{surface === 'drawer' && <DateFields />}</SheetBody>
        </SheetContent>
      </Sheet>
      <Dialog
        open={surface === 'dialog'}
        onOpenChange={(open) => {
          if (!open) setSurface('page');
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>日期对话框</DialogTitle>
          </DialogHeader>
          {surface === 'dialog' && <DateFields />}
        </DialogContent>
      </Dialog>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
