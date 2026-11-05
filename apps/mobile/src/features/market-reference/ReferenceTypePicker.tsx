import { useState } from 'react';
import { Modal } from 'react-native';
import {
  marketReferenceCatalog,
  marketReferenceOptions,
  type MarketReferenceDataset,
} from '@thesis-ledger/schemas';
import { Action, Field, Page } from '../../components/MobilePrimitives';

export function ReferenceTypePicker({
  value,
  onChange,
}: {
  value: MarketReferenceDataset;
  onChange: (value: MarketReferenceDataset) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  return (
    <>
      <Action
        label={`资料类型：${marketReferenceCatalog[value].label}`}
        onPress={() => setOpen(true)}
      />
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <Page title="选择资料类型">
          <Action label="返回查询" onPress={() => setOpen(false)} />
          <Field label="筛选资料" value={search} onChange={setSearch} />
          {marketReferenceOptions
            .filter((option) => option.label.toLowerCase().includes(search.trim().toLowerCase()))
            .map((option) => (
              <Action
                key={option.value}
                label={option.label}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                  setSearch('');
                }}
              />
            ))}
        </Page>
      </Modal>
    </>
  );
}
