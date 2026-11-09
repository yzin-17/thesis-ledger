import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '../src/components/ui/button.js';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '../src/components/ui/sheet.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../src/components/ui/table.js';
import {
  StickyTableActionCell,
  StickyTableActionHeader,
} from '../src/features/shared/StickyTableActions.js';
import { JournalMetricTable } from '../src/features/journal/review/JournalMetricTable.js';
import { ThemeProvider } from '../src/ui/theme.js';
import '../src/ui/styles.css';

function Fixture() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(false);
  return (
    <main className="grid min-w-0 gap-4 p-4">
      <Table className="min-w-[960px]">
        <TableHeader>
          <TableRow>
            <TableHead>标的</TableHead>
            <TableHead>账户</TableHead>
            <TableHead className="text-right">数量</TableHead>
            <TableHead className="text-right">市值</TableHead>
            <StickyTableActionHeader>操作</StickyTableActionHeader>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>隔离验收基金</TableCell>
            <TableCell>隔离账户</TableCell>
            <TableCell className="text-right">100</TableCell>
            <TableCell className="text-right">¥123.45</TableCell>
            <StickyTableActionCell>
              <Button variant="link" onClick={() => setSelected(!selected)}>
                {selected ? '已选择' : '选择'}
              </Button>
            </StickyTableActionCell>
          </TableRow>
        </TableBody>
      </Table>
      <Button className="w-fit" onClick={() => setOpen(true)}>
        查看复盘指标
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>复盘指标</SheetTitle>
          </SheetHeader>
          <SheetBody>
            <JournalMetricTable metrics={{}} />
          </SheetBody>
        </SheetContent>
      </Sheet>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <ThemeProvider>
    <Fixture />
  </ThemeProvider>,
);
