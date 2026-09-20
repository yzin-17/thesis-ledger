# AI SDK 切换与兼容回滚手册

本文只定义 AI 生成链路从手写协议切换到 Vercel AI SDK 后的发布输入、停领步骤和兼容回滚判定，不代表已经完成目标 Docker、真实 Provider 或浏览器验收。实际部署仍使用相邻 `thesis-ledger-infra` 仓库的标准更新入口，并由对应 Review 保存一次性证据。

## 固定运行时与边界

- `AI_GENERATION_RUNTIME` 只接受 `sdk`。当前构建没有 legacy 回退开关，也不会在 SDK 路由未就绪或请求失败后再次调用手写 `/chat/completions`。
- 参数优化、策略发现和研究助手在首次发送前冻结 adapter、模型、生成模式、契约版本、配置指纹、预算与绝对 deadline。在途请求继续使用冻结快照，Provider 热更新只影响后续新请求。
- `AI_RESEARCH_EXECUTION_ENABLED=false` 停止研究任务的新领取和恢复扫描；`STRATEGY_AI_OPTIMIZATION_ENABLED=false` 同时拒绝新优化请求并停止优化恢复调度。这两个开关不删除任务、不清空预留，也不把运行中任务改写成成功或失败。
- Provider 连接测试和业务生成共用 `AiSdkGenerationAdapter`，但连接健康不授予接入就绪或真实验收状态。进程内 fixture 只能显式使用，真实 Provider 失败不会切换到 fixture。

## 发布前本地输入

按低成本到高成本顺序执行：

```bash
pnpm --filter @thesis-ledger/schemas build
pnpm --filter @thesis-ledger/server test
pnpm --filter @thesis-ledger/server build
node scripts/check-boundaries.mjs
node scripts/check-workspace-dependencies.mjs
git diff --check
```

同时记录 `pnpm-lock.yaml` 中 `ai`、`@openrouter/ai-sdk-provider`、`@ai-sdk/openai-compatible` 的精确版本，以及本次源码 revision。生产打包成功只证明依赖与启动输入可构建，不能替代 G0–G2。

## 切换步骤

1. 在旧版本仍运行时先设置 `AI_RESEARCH_EXECUTION_ENABLED=false` 和 `STRATEGY_AI_OPTIMIZATION_ENABLED=false`，通过标准部署入口重启 Server，使所有实例停止新领取。
2. 等待已有租约结束或按业务入口取消任务；不得直接把 `queued`、`running`、`reserved` 或 `dispatching` 改成成功。发送状态不确定的请求必须收敛为 unknown outcome，禁止自动重放。
3. 构建目标 Server 后，在与目标数据库相同的只读连接配置下执行：

   ```bash
   pnpm --filter @thesis-ledger/server ai:rollback-check
   ```

   输出必须为 `decision: "ready"`。退出码 `2` 表示仍有在途任务、未结算请求或无法读取的新版事实；此时保持两个执行开关关闭。退出码 `1` 表示数据库或结构读取失败，同样不得放行。

4. 使用 `./scripts/update.sh thesis-ledger` 完整更新目标运行态。不得使用 `sync-code.sh`、直接 `docker compose build/up` 或 `docker cp` 替代这次运行时依赖更新。
5. 先保持任务停用，核对 Provider 配置、执行路由就绪、健康和真实验收状态彼此独立；再执行 G0 的受控本地 Provider 场景。只有 G0 通过后才逐项恢复执行开关。

## 回滚判定与处理

回滚目标必须能读取 `sdk-execution-v1`，并继续遵守以下规则：

- `legacy_unknown`、partial 和 unknown 用量不能投影成确定零值；known、estimated 和 unknown 费用保持区分，多币种不合并。
- `research_unknown_outcome`、`optimization_unknown_outcome` 及 `OptimizationAttempt.status = unknown_outcome` 保持防重放终态，不能因回滚重新排队。
- 新版请求的 reservation、dispatching、usage revision、settlement 和冻结配置不被清空；超预算后的合法结果仍可读，后续步骤继续阻断。
- 未就绪路由保持不可发送，不得改走旧 Provider、其他模型、fixture 或影子双跑。

执行回滚前再次关闭两个执行开关并运行 `ai:rollback-check`。若输出 `keep_tasks_disabled`，只允许部署能够读取新版事实的兼容修复版本；不得直接恢复旧盲重试或零占位实现。回滚镜像启动后先验证历史详情、用量汇总、unknown 清单和 Provider 就绪阻断，再决定是否恢复任务领取。

## 本任务不执行的验收

- 目标 Docker 更新、并发/崩溃/迟到结果及真实回滚演练属于 G0。
- 三类真实免费模型的业务等价结果属于 G1。
- Provider 设置、计量详情与再次生成的真实浏览器消费属于 G2。

上述门禁未完成时，本文只能作为可执行输入，不能写成发布完成或真实接入通过。
