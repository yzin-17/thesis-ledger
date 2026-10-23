import { useState } from 'react';
import type { InstrumentSearchResult } from '@thesis-ledger/schemas';
import { Copy, Page, Section } from '../../components/MobilePrimitives';
import { InstrumentPicker } from './InstrumentPicker';
export function MarketScreen() {
  const [selected, setSelected] = useState<InstrumentSearchResult | null>(null);
  return (
    <Page title="市场">
      <InstrumentPicker onConfirmed={setSelected} />
      {selected ? (
        <Section title={selected.displayName}>
          <Copy>
            {selected.symbol} · {selected.market}
          </Copy>
          <Copy muted>标的身份已确认，可在账户中录入持仓或成交。</Copy>
        </Section>
      ) : null}
    </Page>
  );
}
