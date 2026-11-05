import { groupBy } from 'es-toolkit/array';
import type { ThesisLedgerApiClient } from '@thesis-ledger/api-client';
type Providers = Awaited<
  ReturnType<ThesisLedgerApiClient['market']['getProviderRegistry']>
>['providers'];
export function localDocumentGroups(
  providers: ReadonlyArray<
    Pick<Providers[number], 'providerId' | 'displayName' | 'sourceKind' | 'upstreamSources'>
  >,
) {
  const local = providers.filter(
    (provider) =>
      provider.sourceKind === 'local_history' || provider.providerId.startsWith('official-'),
  );
  const references = local.flatMap((provider) =>
    (provider.upstreamSources ?? []).flatMap((source) => {
      const data = source.localHistory;
      return (data?.documents ?? []).map((document) => ({
        document,
        provider: provider.displayName,
        source: source.displayName,
        data: data!,
      }));
    }),
  );
  const groups = Object.values(groupBy(references, (reference) => reference.document.url)).map(
    (rows) => ({ document: rows[0]!.document, references: rows }),
  );
  return {
    groups,
    incomplete: local.some((provider) =>
      (provider.upstreamSources ?? []).some(
        (source) => source.localHistory?.documents === undefined,
      ),
    ),
  };
}
