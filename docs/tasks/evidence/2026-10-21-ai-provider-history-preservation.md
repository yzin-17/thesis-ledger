# AI 历史价格与旧客户端保留验收回执

接续[配置原任务](../2026-09-21-ai-provider-model-usage-configuration.md) AC-12/27，按[原 Spec](../../specs/2026-09-21-ai-provider-model-usage-configuration.md)验证当前配置不能重算历史任务和费用。使用仓库既有真实 PostgreSQL/HTTP 栈及实际 `AiExecutionStateStore`；SDK 为受控空实现，四项均断言零调用。

## 实际历史与断言

每项先经正常 API 保存专用停用配置，或构造明确 legacy 数据库样本；从真实配置的实际路由快照冻结输入/输出价 0.1/0.2、价格版本和配置指纹。实际状态存储建立并结算专用任务：预留 USD 0.3，合成上游已知费用 USD 0.25，输入/输出各 1000。它们是隔离合成事实，不代表真实上游结果或支出。

| 场景                     | 实际验证                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| 正常 API 改为 9/9        | 新配置确实改价；原 AiRun 原始 JSON 逐字节不变，历史详情与固定窗口费用汇总 HTTP 结果完全相同 |
| 显式 legacy 全局价格迁移 | 应用返回 applied；历史原始 JSON、冻结预留、已结算费用及 HTTP 投影保持                       |
| 旧客户端省略模型价格     | 409；当前配置与历史均未写，详情仍可读取                                                     |
| 正常删除已停用配置       | 配置确实不存在；原 AiRun 未删，历史详情仍为 200、费用仍为 USD 0.25                          |

这组证据验证了配置改价、迁移及生命周期与历史事实的边界，包含实际保存服务、数据库和读 API；不以纯规划或内存存储代替 PostgreSQL。真实模型认证、生成、上游费用及业务结果仍按原门禁保持未通过。

## 入口、输入与结果

- 新测试：`apps/server/test/ai/ai-provider-history-preservation-postgres.integration.test.ts`，已加入维护脚本默认名单。
- `pnpm --filter @thesis-ledger/server typecheck`、新文件 `eslint --max-warnings 0` 和受影响 Prettier 检查通过。
- 实际命令：`node scripts/test-ai-provider-postgres.mjs test/ai/ai-provider-history-preservation-postgres.integration.test.ts`，工作目录为主仓，退出 0；4 项全部通过，无环境跳过。
- 专用数据库为 `ai_provider_concurrency_fixture`，owner 为 `fixture_owner`，完整 35 份 migration。脚本核对所有权并清理自有测试容器；不连接目标数据库。
- 生产源码、Schema、manifest 和运行时入口未变，因此复用此前正常构建、[正式最小同步及目标保护](2026-10-21-ai-provider-pricing-migration.md)和[实际模块/边界回归](2026-10-21-ai-config-contract-regression.md)，不再次构建镜像或同步目标。

目标 Server/Worker 的容器身份和镜像在正式快更前后不变，配置/密文、路由和业务保护已独立核对。默认设置仅按[并发预案](2026-10-21-ai-settings-concurrency.md)正常推进一次版本；后续保护摘要为 `f572f9214cad03ba756c032a206931be67c43fb894b170f48082d1e6fef2b325`。目标 AiRun 为零，正向历史证据明确属于隔离 PostgreSQL，不声称验过目标存量非空 AI 历史。

私有日志位于 `.recovery-artifacts/remaining-p1-2026-10-20/ai-history-preservation-{typecheck,lint,format,postgres}.log`。原 AC-12/27 所要求的历史保留、部署保护与旧客户端有损拒绝条件通过；其他真实费用、认证和业务 AC 不由此关闭。子任务归档后继续原优先级，不结束总 Goal。
