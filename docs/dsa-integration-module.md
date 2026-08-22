# DSA Integration Module

## Design

DSA is an external integration capability and should not be coupled with platform infrastructure.

Target dependency:

```
MarketModule
    |
    v
DsaModule
    |
    v
DsaClient
```

PlatformModule should only contain shared infrastructure capabilities.

## Prisma Runtime

Prisma Client is generated during Docker image build time. Runtime containers should not run `prisma generate` on startup because it increases startup latency and duplicates work across replicas.
