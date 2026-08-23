export type AiResearchScope = 'portfolio' | 'account' | 'position' | 'strategy';

export interface AiRunRecord {
  id: string;
  provider: string;
  model: string;
  promptVersion: string;
  status: string;
  context: { scope?: string; symbol?: string } | null;
  createdAt: string;
}

export interface AiRunResult {
  id: string;
  provider: string;
  model: string;
  promptVersion: string;
}

export interface CreateAiRunInput {
  provider: string;
  model: string;
  promptVersion: string;
  context: { scope: string; symbol?: string };
  modelMetadata?: unknown;
}
