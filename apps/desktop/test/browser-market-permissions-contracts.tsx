import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MarketProviderRow } from '../src/features/market-data/MarketProviderRow.js';
import { ProviderAccountAccessPanel } from '../src/features/market-data/ProviderAccountAccessPanel.js';
import { MarketReferenceContractField } from '../src/features/market-data/MarketReferenceContractField.js';
import { Button } from '../src/components/ui/button.js';
import { catalog, key, provider, target } from './market-policy-defaults.fixture.js';
import '../src/ui/styles.css';

const controlledProvider = {
  ...provider,
  accountAccessSupported: true,
  configVersion: 1,
  requiresCredential: true,
  credentialConfigured: false,
  credentialSchema: { methods: [{ method: 'api_key', label: '接口密钥', fields: [] }] },
};
const controlledCatalog = {
  ...catalog,
  entries: [
    {
      key,
      target,
      state: 'ready' as const,
      accountAccess: {
        state: 'permission_missing' as const,
        attempted: true,
        errorCode: 'permission_denied',
      },
    },
  ],
};
function Fixture() {
  const [configured, setConfigured] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState('');
  const [symbol, setSymbol] = useState('');
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4">
      <MarketProviderRow
        provider={{ ...controlledProvider, credentialConfigured: configured, enabled }}
        catalog={controlledCatalog}
        disabled={false}
        busyAction={null}
        onConfigure={() => setConfigured(true)}
        onProviderChange={(next) => setEnabled(next.enabled)}
        onTest={() => setMessage('受控检查入口')}
        onRemove={() => setMessage('受控移除入口')}
      />
      <ProviderAccountAccessPanel
        provider={controlledProvider}
        catalog={controlledCatalog}
        report={null}
        dirty={dirty}
      />
      <Button variant="outline" onClick={() => setDirty((value) => !value)}>
        切换未保存输入
      </Button>
      <output aria-label="操作回执">{message}</output>
      <MarketReferenceContractField kind="future" value={symbol} onChange={setSymbol} />
      <output aria-label="合约原始代码">{symbol}</output>
    </main>
  );
}
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <Fixture />
  </QueryClientProvider>,
);
