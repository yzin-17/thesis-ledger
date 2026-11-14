import type { ProviderIssueRecord } from './providers.types.js';

export function dataQualityLastSeenLabel(issue: ProviderIssueRecord) {
  const value = issue.details?.lastSeenAt ?? issue.detectedAt;
  if (typeof value !== 'string') return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleString('zh-CN');
}
