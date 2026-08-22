# DSA 集成模块

本文记录主仓对 DSA 的集成边界和 Prisma 运行时约束。DSA 是外部能力服务，不与平台基础设施模块耦合。

## 模块边界

依赖方向保持单向：

```text
MarketModule
    |
    v
DsaModule
    |
    v
DsaClient
```

`PlatformModule` 只拥有 Prisma、Redis、metrics 和 health service 等共享基础设施。业务模块通过 `DsaModule`/`DsaClient` 访问 DSA Contract，不直接依赖 DSA Provider SDK、原生 manager 或 DSA 数据库。

DSA 的 Provider 适配器、凭证、Effective Policy 和原始运行时细节属于同级 `daily-stock-analysis` 仓库；主仓只维护消费侧 Contract、Adapter、Stub 和跨仓验证入口。当前跨仓版本边界以 [`architecture/version-matrix.md`](../architecture/version-matrix.md) 为准。

## Prisma 运行时

Prisma Client generation 是 Docker image build 流程的一部分。

运行时容器启动时不执行 `prisma generate`，避免增加启动延迟，也避免在多副本环境中重复生成。数据库迁移仍按既有发布顺序和 migration matrix 执行。
