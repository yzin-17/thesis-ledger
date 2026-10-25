# AI 自适应超时与重试的本地交付回执

日期：2026-10-25。对应[规格 AE1～AE7](../../specs/2026-10-25-ai-adaptive-execution.md)及[实施任务](../2026-10-25-ai-adaptive-execution.md)，承接 [G3-D33](2026-10-25-g3-reasoning-off-control.md)。本回执证明源码、本地 SDK／HTTP、隔离 Redis 与保全检查；目标部署和真实模型仍由 T5 单独验收。

## 实际行为

- 研究执行固定原 Provider／请求模型，每次发送继续经过原请求预留、所有权和原子派发授权。SDK 保持 `maxRetries=0`，没有新增模型选择或隐式发送。
- 系统缺省超时按策略计算：缓存失效、样本不足或有关截尾样本存在时，使用冻结任务剩余期限；显式用途／Provider 设置优先，旧记录缺少来源但有数值时也按显式设置保留。用户取消与绝对期限组成独立 AbortSignal，SDK／trace 准备开销不能重新起算总时限。
- 固定模型的首语义输出和最大输出停顿分组统计；只有满足默认规则的 299 项完整观测，才依据观测最大值收紧预算。299 来自目标覆盖率 99%、置信度 95% 的一侧容忍界，不是声称已采到这些数据或已达到实测 SLA。规则、来源、完整／截尾样本数、候选等待值及绝对期限截断标识都进入 trace。
- 首输出前失败保留等待下界，输出后中断保留停顿下界；不能将超时值当作准确首输出时间，或只用成功的快样本学习。头、保活、空 delta 不构成语义输出。实际模型不匹配及 `openrouter/free`／`openrouter/auto` 不混入固定模型统计。
- 重试次数逐次决定：首版仅对明确生成前拒绝且有 `Retry-After` 的请求，检查剩余次数、期限、预期首输出和配额后重试；等待遵守服务端下限并带抖动。无服务端等待依据、认证／Schema／业务错误、取消、流中断或未知结果不自动重试。
- 额外尝试上限来自现有 `maxAiCalls`，现行合同最多两次尝试；每个 profile 的一个运行配额原子领取，成功补充、持续失败后降为零。该缓存配额不是调用授权，单次授权始终没有额外尝试。重试重新进行 Token／费用预留，耗尽时零次新发送并收敛失败。
- 运行缓存复用 Redis 独立命名空间；24 小时 TTL、512 项观测／去重标识、256 个 profile 的容量收敛。缓存损坏／不可用使等待回到剩余期限并停止额外尝试，不覆盖原 Provider 事实或业务结果。缓存写入为尽力操作，不阻塞业务结算。

当前实际 Provider 配置也已只读核清：OpenRouter 仅有 `timeoutMs=120000`，没有 `firstOutputTimeoutMs`／`outputIdleTimeoutMs` 显式覆盖。因此，D33 的 30 秒首输出限制来自系统缺省；Provider 的 120 秒探测预算与研究总时限、首输出等待分别处理。本轮配置没有修改。

现默认仍为 `openrouter/free`。由于其实际模型在请求前不固定，该名称使用保守的剩余期限，并禁止策略额外重试；固定 Nvidia 路径可以独立学习，后续真实验收须按新的明确授权执行。

## 代码所有权与写集

| 职责 | 源码 |
| --- | --- |
| 分组、容忍界、显式覆盖、重试准入 | `apps/server/src/ai/adaptive/ai-adaptive-policy.ts` |
| 单次语义进展、准确时间与截尾下界 | `apps/server/src/ai/adaptive/ai-adaptive-observation.ts` |
| 有限历史、原子配额及缓存失效处理 | `apps/server/src/ai/adaptive/ai-adaptive-history.store.ts` |
| 单次 SDK 等待策略及反馈、重试决策 | `apps/server/src/ai/adaptive/ai-adaptive-execution.ts` |
| 请求组装、预留／结算、同路由循环与未知结果保护 | `ai-research-sdk-contract.ts`、`ai-research-sdk-accounting.ts`、`ai-research-sdk-execution.ts` |
| Nest 接线、空 delta 处理与 trace 输入 | `ai.module.ts`、`ai-sdk-generation.adapter.ts`、`trace/ai-trace-sdk.ts` |
| 依赖门禁 | `scripts/check-boundaries.mjs`，禁止策略读取 Provider registry、业务数据库或直接修改执行账本 |
| 受控验证 | 5 个 `ai-adaptive-*.test.ts`、`research-sdk-http.fixture.ts` 及原研究 SDK 集成测试 |
| Redis 隔离入口 | infra `scripts/verify-ai-adaptive-cache.mjs` 及同名 `.test.mjs` |

研究执行文件由原 535 行收敛至 510 行；请求映射、结算与观测各有明确职责。HTTP 服务夹具从测试断言中提取，原 trace 集成测试最终与改动前备份逐字节一致。未增加 ignore、提高复杂度／尺寸阈值或改依赖、数据库 Schema／migration。

## 验证结果与范围

断言映射：AE1 由等待预算／绝对信号与本地迟到首块测试证明；AE2／AE3 由容忍界、分组和观测截尾测试证明；AE4／AE5 由执行账本、本地拒绝／预算／恢复用例及真实 Redis 配额验证；AE6 由 trace 反读、Nest 注入、缓存和保全验证；AE7 的本地部分由完整受影响集成组证明，目标运行部分保持 T5 未完成。

| 验证 | 结果 | 证明边界 |
| --- | --- | --- |
| 受影响 Server 测试 | 11 文件、109 项通过 | 策略／缓存／截尾／真实 SDK 的本地 HTTP、trace、原 readiness 回归；外部模型 0 |
| Server `typecheck` | 通过 | 含新增测试及生产代码 |
| Server `build` | 通过 | 宿主编译产物；没有构建或部署应用镜像 |
| 定向 ESLint 与复杂度 | 0 错误、0 警告 | 所有本次修改的 TS 实现／测试，complexity 20、函数 220 行参考线保持 |
| 仓库边界 | `Import boundaries: OK` | 新模块依赖门禁通过 |
| 工作区依赖 | 8 包通过 | 没有新增运行依赖或 manifest 改动 |
| infra 入口安全约束 | 2 项通过 | 镜像精确、唯一所有权、无网络／挂载／拉取和目标更新 |
| 隔离真实 Redis | 通过 | 两客户端原子领取、去重、TTL／512 项／256 profile、损坏和停机降级；使用同一编译缓存实现与 CLI 桥，临时容器已清理 |
| 编译产物 Nest 注入 | 通过 | 必需的自适应依赖及共享 Redis adapter 可构造；隔离应用上下文，外部连接 0 |
| 文档与最终 diff | 94 条本地链接无缺失、定向 diff 检查通过 | 11 项生产源码摘要与最终验证输入一致；不替代运行态验收 |

隔离 Redis 复用本地镜像 `sha256:3811787313eba226a2ef38658c6ccb91cd5e110edc89c37767de373120a0e5a0`，由 infra 专用入口创建无网络／无持久挂载的唯一标签容器；只停止并删除该自有容器。没有拉取镜像、重建目标服务或修改目标 Redis。真实 ioredis 连接、目标 Nest 启动及真实模型时序仍属于 T5。

主要命令与完整日志保存在私有 `.recovery-artifacts/g3-d34-20261025/`：

```text
pnpm --filter @thesis-ledger/server exec vitest run test/ai/ai-adaptive-policy.test.ts test/ai/ai-adaptive-history.test.ts test/ai/ai-adaptive-observation.test.ts test/ai/ai-adaptive-execution.test.ts test/ai/ai-adaptive-trace.test.ts test/ai/ai-research-sdk-execution.integration.test.ts test/ai/ai-sdk-generation-adapter.test.ts test/ai/ai-sdk-generation-adapter.integration.test.ts test/ai/ai-trace.test.ts test/ai/ai-trace.integration.test.ts test/ai/ai-provider-readiness.test.ts
pnpm --filter @thesis-ledger/server typecheck
pnpm --filter @thesis-ledger/server build
node scripts/check-boundaries.mjs
node scripts/check-workspace-dependencies.mjs
```

在 `thesis-ledger-infra` 执行：

```text
node --test scripts/verify-ai-adaptive-cache.test.mjs
node scripts/verify-ai-adaptive-cache.mjs
```

定向 lint 使用原规则及 `complexity:[warn,20]`、`max-lines-per-function:[warn,{max:220,skipBlankLines:true,skipComments:true}]`；准确文件清单见上方写集及 `lint.log`。其他证据包括 `affected-tests.log`、`typecheck.log`、`build.log`、`boundaries.log`、`dependencies.log`、`redis-isolation.log`、`di-smoke.log`、`timeout-source-proof.json` 和 `protection-proof-final.json`。生产源码 11 文件摘要已记录，可对账测试适用输入。

## 保全与剩余验收

`2026-10-25T14:23:44.676Z` 的只读保全回执与 D33 收尾逐项比较通过：22 表全部原行摘要、10 条 AiRun、110 条 AiToolCall、原提交、旧 AI、DSA 控制／路由、环境、同一容器及挂载保持；默认仍为 OpenRouter/free、修订 5，V2=false、capabilities HTTP 200／canCreate=false。D33 原 manifest 及 9 份产物摘要一致，captureStatus 仍为 incomplete；没有回填或清理旧验收包。

三仓 HEAD、既有配置文件摘要与空暂存区保持。并行 WIP 继续保留；主仓／infra 本轮新增源码、测试及文档，DSA 无本轮写集。未 stage、commit、push 或部署目标应用；本轮真实模型调用 0，余 4 次冻结。

本地工程交付不等于 G3 正向报告：T5 尚未部署／验真实 Provider，实际延迟分布、学习是否收敛、目标缓存重启与服务组合尚无真实验收。D31 两字符内部根因、D32 tuple 约束及 D33 正文引用错误保持原义务；本轮没有放宽业务校验、改 Prompt 或更改默认推理／模型配置。
