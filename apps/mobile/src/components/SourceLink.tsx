import { useState } from 'react';
import { openExternalLink } from '../platform/links/open-link';
import { Action, Feedback, failureMessage } from './MobilePrimitives';
export function SourceLink({ url, label = '在浏览器打开原文' }: { url: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await openExternalLink(url, undefined, { allowHttp: true });
    } catch (caught) {
      setError(failureMessage(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Action label={label} disabled={busy} onPress={() => void open()} />
      <Feedback message={error} error />
    </>
  );
}
