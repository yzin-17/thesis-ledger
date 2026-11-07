import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '../src/components/ui/button';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog';
import { Field, FieldGroup, FieldLabel } from '../src/components/ui/field';
import { Input } from '../src/components/ui/input';
import { useDraftCloseGuard } from '../src/features/shared/useDraftCloseGuard';
import '../src/ui/styles.css';

declare global {
  interface Window {
    draftCloseHarness?: {
      setBusy: (busy: boolean) => void;
      setDraft: (draft: string) => void;
      setOpen: (open: boolean) => void;
    };
  }
}

function Harness() {
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('原始草稿');
  const [closeCount, setCloseCount] = useState(0);
  const requestClose = useDraftCloseGuard({
    open,
    busy,
    draft,
    onOpenChange: (nextOpen) => {
      if (!nextOpen) setCloseCount((count) => count + 1);
      setOpen(nextOpen);
    },
  });
  useEffect(() => {
    window.draftCloseHarness = { setBusy, setDraft, setOpen };
    return () => {
      delete window.draftCloseHarness;
    };
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-5 p-6">
      <h1 className="text-xl font-semibold">草稿关闭竞态验收</h1>
      <p className="text-sm text-muted-foreground">状态仅保存在本页内存中。</p>
      {open ? (
        <section aria-label="受控编辑面板" className="flex min-w-0 flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="draft">草稿内容</FieldLabel>
              <Input
                id="draft"
                value={draft}
                disabled={busy}
                onChange={(event) => setDraft(event.target.value)}
              />
            </Field>
          </FieldGroup>
          <p role="status" className="text-sm">
            {busy ? '保存中' : '可编辑'}
          </p>
          <Button disabled={busy} onClick={() => void requestClose(false)}>
            关闭面板
          </Button>
        </section>
      ) : (
        <p className="text-sm">面板已关闭</p>
      )}
      <p data-testid="close-count" className="text-sm">
        已确认关闭 {closeCount} 次
      </p>
      <Button variant="outline" onClick={() => setOpen(true)}>
        重新打开面板
      </Button>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <ConfirmDialogProvider>
    <Harness />
  </ConfirmDialogProvider>,
);
