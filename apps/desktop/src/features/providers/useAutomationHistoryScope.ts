import { useState } from 'react';
import { AUTOMATION_HISTORY_PAGE_SIZE, type AutomationHistoryPage } from './providers.types.js';

export function useAutomationHistoryScope() {
  const [page, onPage] = useState(1);
  const [jobId, setJobId] = useState<string>();
  const onJobChange = (next: string | undefined) => {
    setJobId(next);
    onPage(1);
  };
  const emptyPage: AutomationHistoryPage = {
    items: [],
    page,
    pageSize: AUTOMATION_HISTORY_PAGE_SIZE,
    total: 0,
    totalPages: 0,
  };
  return { page, jobId, onPage, emptyPage, filterProps: { jobId, onJobChange } };
}
