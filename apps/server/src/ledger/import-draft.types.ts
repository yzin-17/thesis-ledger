export interface ImportDraftOptions {
  scope?: 'FULL' | 'PARTIAL';
  observedAt?: string;
  capturedAt?: string;
  timePrecision?: 'INSTANT' | 'DATE';
  sourceTimezone?: string;
}
