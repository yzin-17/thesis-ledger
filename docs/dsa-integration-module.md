# DSA Integration Module

## Design

DSA is an external integration capability and should not be coupled with platform infrastructure.

Dependency direction:

```
MarketModule
    |
    v
DsaModule
    |
    v
DsaClient
```

`PlatformModule` only owns shared infrastructure such as Prisma, Redis, metrics and health services.

## Prisma Runtime

Prisma Client generation remains part of Docker image build flow.

Runtime containers should not execute `prisma generate` during startup because it adds startup latency and repeats work across replicas.
