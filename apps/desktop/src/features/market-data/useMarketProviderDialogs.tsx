import { useState } from 'react';
import type { MarketRouteCatalogReadV3, ProviderManifest } from './market-data.types.js';
import { isLocalHistoryProvider } from './market-local-history.js';
import { LocalHistoryDocumentsSheet } from './LocalHistoryDocumentsSheet.js';
import { ProviderExactChecksSheet } from './ProviderExactChecksSheet.js';
import { ProviderCredentialsSheet } from './ProviderCredentialsSheet.js';

export function useMarketProviderDialogs(
  providers: ProviderManifest[],
  catalog: MarketRouteCatalogReadV3 | undefined,
) {
  const [checkId, setCheckId] = useState<string | null>(null);
  const [credentialId, setCredentialId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const check = providers.find((provider) => provider.providerId === checkId);
  const credential = providers.find((provider) => provider.providerId === credentialId);
  const history = providers.find((provider) => provider.providerId === historyId);
  return {
    configure: (provider: ProviderManifest) => setCredentialId(provider.providerId),
    inspect: (provider: ProviderManifest) => {
      if (isLocalHistoryProvider(provider)) setHistoryId(provider.providerId);
      else if (provider.accountAccessSupported) setCredentialId(provider.providerId);
      else setCheckId(provider.providerId);
    },
    dialogs: (
      <>
        {history && (
          <LocalHistoryDocumentsSheet
            key={history.providerId}
            provider={history}
            onClose={() => setHistoryId(null)}
            onReadCheck={() => {
              setHistoryId(null);
              setCheckId(history.providerId);
            }}
          />
        )}
        {check && (
          <ProviderExactChecksSheet
            key={check.providerId}
            provider={check}
            catalog={catalog}
            onClose={() => setCheckId(null)}
            onConfigure={() => {
              setCheckId(null);
              setCredentialId(check.providerId);
            }}
          />
        )}
        {credential && (
          <ProviderCredentialsSheet
            key={credential.providerId}
            provider={credential}
            {...(catalog ? { catalog } : {})}
            onClose={() => setCredentialId(null)}
          />
        )}
      </>
    ),
  };
}
