import type {
  AiAdapter,
  AiGenerationContractRef,
  AiGenerationHttpRequestDiagnostic,
} from '@thesis-ledger/schemas';
import { AiGenerationHttpRequestDiagnostics } from './ai-generation-http-request-diagnostics.js';
import { AiGenerationStreamDiagnostics } from './ai-generation-stream-diagnostics.js';

export type AiGenerationDiagnostics = {
  stream: AiGenerationStreamDiagnostics;
  http: AiGenerationHttpRequestDiagnostics;
};

export const createGenerationDiagnostics = (input: {
  contract: AiGenerationContractRef;
  adapter: AiAdapter;
  transport: 'single' | 'stream';
}): AiGenerationDiagnostics | undefined => {
  if (input.contract.id !== 'research' || input.contract.version !== 'research-generation-v2')
    return undefined;
  return {
    stream: new AiGenerationStreamDiagnostics(input.adapter, input.transport),
    http: new AiGenerationHttpRequestDiagnostics(),
  };
};

export const generationDiagnosticSnapshots = (diagnostics?: AiGenerationDiagnostics) =>
  [diagnostics?.stream.snapshot(), diagnostics?.http.snapshot()] as const;

export const generationHttpRequestFields = (
  diagnostics?: AiGenerationDiagnostics,
): { httpRequest?: AiGenerationHttpRequestDiagnostic } => {
  const httpRequest = diagnostics?.http.snapshot();
  return httpRequest ? { httpRequest } : {};
};
