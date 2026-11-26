import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { convertNamedV1ProviderRoutes, namedV1ProviderRoutesSchema } from './named-v1-provider-conversion.js';

const providers = z.array(z.strictObject({ id: z.uuid(), routes: namedV1ProviderRoutesSchema }))
  .parse(JSON.parse(readFileSync(0, 'utf8')));

process.stdout.write(JSON.stringify({
  contract: 'ai-provider-route-migration-preview-v1',
  providers: providers.map(({ id, routes }) => {
    const result = convertNamedV1ProviderRoutes(routes);
    return { id, counts: result.counts, routes: result.routes };
  }),
}) + '\n');
