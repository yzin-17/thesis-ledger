import { useState } from 'react';
import type { InstrumentSearchResult } from '@thesis-ledger/schemas';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MarketStackParams } from '../../app/navigation-types';
import { Action, Copy, Page, Section } from '../../components/MobilePrimitives';
import { InstrumentPicker } from './InstrumentPicker';
import { mobileInstrument } from '../market-detail/market-model';
export function MarketScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MarketStackParams>>();
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
          <Action
            label="查看标的行情"
            primary
            onPress={() =>
              navigation.navigate('MarketDetail', { instrument: mobileInstrument(selected) })
            }
          />
        </Section>
      ) : null}
      <Action label="市场快讯" onPress={() => navigation.navigate('MarketNews')} />
      <Action label="公告与已收录原文" onPress={() => navigation.navigate('MarketAnnouncements')} />
      <Action label="已收录规则资料" onPress={() => navigation.navigate('MarketDocuments')} />
    </Page>
  );
}
