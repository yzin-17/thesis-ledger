import { requestDesktopJson, type DesktopRequestClient } from '../shared/request.js';
import type { AiRunRecord, AiRunResult, CreateAiRunInput } from './ai.types.js';

export const fetchAiRuns = (client?: DesktopRequestClient) =>
  requestDesktopJson<AiRunRecord[]>('/ai/runs?limit=20', undefined, client);

export const createAiRun = (input: CreateAiRunInput, client?: DesktopRequestClient) =>
  requestDesktopJson<AiRunResult>(
    '/ai/runs',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
    client,
  );
