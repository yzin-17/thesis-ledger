# AI 模型价格迁移验收回执

接续[原配置任务](../2026-09-21-ai-provider-model-usage-configuration.md) AC-25/26，合同见[迁移 Spec](../../specs/2026-10-21-ai-provider-pricing-migration.md)。原来只有 dry-run，完整数据库应用不依赖模型；本次补齐该缺口。主线程直接实施，真实模型继续暂停，DG3 保持 TODO，只验 Web。

## 行为与数据保护

- 新增 `apps/server/src/ai/ai-provider-pricing-migration.cli.ts`，默认只读。应用必须显式提供 `--apply`、预览指纹、数据库和角色；可用重复 `--provider` 精确限定范围。未知/重复/不完整参数在连接数据库前拒绝。
- 复用既有 AI 配置/默认设置事务栅栏，绑定原始 JSONB 文本和原修订做条件更新。任一冲突或失败整批回滚；两次执行同一计划只写一次、审计一次。
- 价格由 PostgreSQL JSONB 原值复制，保留高精度、零、已有模型价格及其他设置；新增完整版本/时间/`legacy_provider` 元数据，通过实际价格读取器消费。迁移后删除三个全局旧价格键，未来新增模型保持未知。
- 既有微秒修订推进并对齐毫秒；缺字段、非法价格、超限/重复/带空白模型键、旧用途路由冲突保留原值。极小负数在数据库内按精确数值拒绝，不受 JavaScript 下溢为 `-0` 影响。
- 不修改凭据、启停、用途、默认引用、历史任务或费用事实；未增加 API、界面入口、Schema、依赖或启动时自动迁移。

## 本地及真实隔离 PostgreSQL

| 层级           | 命令或输入                                                                                                                 | 最终结果                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 定向           | Server Vitest：`ai-provider-migration.test.ts`、`ai-provider-pricing-migration-cli.test.ts`、`ai-routing-settings.test.ts` | 3 文件、26 项通过                                                            |
| 类型/构建      | `pnpm --filter @thesis-ledger/server typecheck`；`pnpm --filter @thesis-ledger/server build`                               | 通过                                                                         |
| 工程门禁       | `node scripts/check-boundaries.mjs`、`pnpm guardrails:complexity`                                                          | 返回 0；原存量告警和八份缺少有效 ratchet baseline 的文件继续保留             |
| 最终受影响文件 | 七份源码/测试 `eslint --max-warnings 0`；八份代码及 Spec/Task 的 Prettier 检查                                             | 通过；初次全仓检查中的新增测试块行数告警已按保留/幂等与冲突/事务职责拆分消除 |
| 独立数据库     | `node scripts/test-ai-provider-postgres.mjs test/ai/ai-provider-pricing-migration-postgres.integration.test.ts`            | 9 项真实 PostgreSQL 检查全部通过，无环境跳过；专用容器按脚本清理             |

隔离目标为 `ai_provider_concurrency_fixture`，owner 为 `fixture_owner`，完整应用 35 份 migration。验证精确小数、显式零、已有价格元数据、其他高精度设置、测试凭据、非 AI 配置、默认及历史任务；另覆盖重试/未来模型、两类冲突整批不写、过期计划/错误身份/缺失范围、两类极小负数、两个独立 CLI 进程竞争和第二项审计故障全回滚。独立进程实际返回一次 `applied`、一次 `noop`，审计仅一条。

## 正式同步及目标只读消费

执行目录为 `thesis-ledger-infra`，入口为 `./scripts/sync-code.sh thesis-ledger`，退出 0，Server/Worker 均健康。没有 manifest、Schema、migration 或运行时依赖变化，兼容预检通过；仅更新容器可写层，镜像仍为 `sha256:1562291459dea8079e7a3edf53ece29a9cfd7e14f38c7afad11546e314bae880`，不是新镜像或发布证据。

在两个实际容器运行默认只读 CLI，均确认 `thesis_ledger` / `thesis_ledger_app`，预览指纹均为 `c63c63e30de4ed7843d99f59f7653c32f0cbf5fac1f5e120974ef543df5f6030`。现有 `ac48-acceptance-20261017`、`lmstudio`、`openrouter` 均为 `noop`，无冲突或待补项。没有向目标制造 legacy 样本，也没有执行目标 apply。

Server、Worker 与宿主构建的四份模块摘要完全一致：

| 模块                                       | SHA-256                                                            |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `ai-provider-migration.js`                 | `d9b2db3388fcaa2d6e833783ea597281d3aac9ff71ad988aa6633e6b5cb08553` |
| `ai-provider-configuration-transaction.js` | `0e1d96046a34472a387bfc345881e232a232a72062d9289381bad10eaa2f5ceb` |
| `ai-provider-pricing-migration.js`         | `eb0af9bbb333e10f7bea74a5f6f768aa45e478f6bb261f920e9236a930f56c45` |
| `ai-provider-pricing-migration.cli.js`     | `704ccb5fcaf547021d03e8c43413e89527ff59ad8c30888bad50daafcf8d86eb` |

同步/预览前后，十二账户、十三表摘要、57 个成功回测、配置/密文/默认/路由、目录及模型计数的整个保护 JSON 逐字节一致，SHA-256 均为 `606c463b182b7d76ad7d31ffbf127fd7d4cd145ffa105d2b70e0ca00835a0c83`。AiRun、工具、观察、模型 invocation/fact 仍为零。执行开关的既有值保留；暂停由操作边界实施，不声称开关为 false。

## 私有证据与原验收状态

证据目录：`.recovery-artifacts/remaining-p1-2026-10-20/`。保留 `ai-pricing-migration-{unit,typecheck,build,boundaries,guardrails,lint,format,postgres,sync}.log`、`ai-pricing-migration-runtime.json` 及 `ai-pricing-migration-target-{before,after}.json`。

- 最终 PostgreSQL 日志：`54715f2e7a0ca53831aa49000d282980a4325c5415a23462d0ee79037d113c8b`。
- 正式同步日志：`404a9ee6dbba623d434ee85bfb91fa0cac0ef24eb9b65f2cb5936501ddf061f7`。
- 两容器只读运行回执：`d421918b46672078116b285210d40135a47819d1724267454d3c1c224f2c3cf2`。

AC-25 的完整数据库迁移/幂等和 AC-26 的冲突事务已有对应层级证据，可关闭这两个条件。真实认证、费用、生成、默认模型正向消费及其他完整 AC 保持原状态；随后继续 AC-28 的非生成目标并发，不以本子任务结束总 Goal。
