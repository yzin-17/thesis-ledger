import { groupBy } from 'es-toolkit';
import type { LocalHistorySource } from '@thesis-ledger/schemas';
import type { ProviderManifest } from './market-data.types.js';

export type LocalHistoryDocumentReference = {
  document: NonNullable<LocalHistorySource['documents']>[number];
  sourceId: string;
  sourceName: string;
  data: LocalHistorySource;
};

export const localHistoryDocumentGroups = (provider: ProviderManifest) => {
  const references: LocalHistoryDocumentReference[] = (provider.upstreamSources ?? []).flatMap(
    (source) => {
      const data = source.localHistory;
      if (!data?.documents) return [];
      return data.documents.map((document) => ({
        document,
        sourceId: source.sourceId,
        sourceName: source.displayName,
        data,
      }));
    },
  );
  return Object.values(groupBy(references, (reference) => reference.document.url)).map((group) => ({
    document: group[0]!.document,
    references: group,
  }));
};

export const filterLocalHistoryDocuments = (
  groups: ReturnType<typeof localHistoryDocumentGroups>,
  query: string,
) => {
  const keyword = query.trim().toLocaleLowerCase();
  return groups.filter((group) =>
    `${group.document.title} ${group.references
      .map((reference) => `${reference.sourceName} ${reference.data.symbols.join(' ')}`)
      .join(' ')}`
      .toLocaleLowerCase()
      .includes(keyword),
  );
};
