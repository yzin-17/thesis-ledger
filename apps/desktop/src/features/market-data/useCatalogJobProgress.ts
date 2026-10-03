import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { catalogJobFeedback } from './catalog-job-response.js';
import { marketDataKeys, useCatalogJobQuery } from './market-data.queries.js';

export function useCatalogJobProgress(
  jobId: string | null,
  clearJob: () => void,
  setMessage: (message: { type: 'success' | 'error'; text: string }) => void,
) {
  const queryClient = useQueryClient();
  const job = useCatalogJobQuery(jobId);
  useEffect(() => {
    if (!jobId) return;
    const feedback = catalogJobFeedback(job.data, job.isError);
    if (!feedback) return;
    setMessage(feedback);
    clearJob();
    if (feedback.type === 'success')
      void queryClient.invalidateQueries({ queryKey: marketDataKeys.catalog() });
  }, [jobId, job.data, job.isError, clearJob, setMessage, queryClient]);
  return job;
}
