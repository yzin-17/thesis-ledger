import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export function liveExperimentImplementationHashes() {
  return Object.fromEntries(
    [
      'research-live-experiment-protocol',
      'research-live-experiment-budget',
      'research-live-experiment-evaluation',
      'research-live-experiment-driver',
      'research-live-experiment-arm',
      'research-live-experiment-request-options',
      'research-live-experiment-target',
      'research-live-experiment-resume',
      'research-live-experiment-continuation',
      'research-live-experiment-terminal',
      'research-live-experiment-supplemental',
      'research-live-experiment-failure-policy',
      'research-experiment-audit',
      'research-experiment-protocol',
      'ai-research-numeric-evidence-v2',
      'ai-research-frozen-integrity-v2',
      'timeout/ai-experiment-timeout',
      'ai-sdk-generation.adapter',
    ].map((name) => [
      name,
      createHash('sha256')
        .update(readFileSync(`apps/server/dist/src/ai/${name}.js`))
        .digest('hex'),
    ]),
  );
}
