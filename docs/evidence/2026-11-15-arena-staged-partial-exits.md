# 竞技场逐次分档退出验收证据

[规格](../specs/2026-11-15-arena-staged-partial-exits.md) · [归档 Task](../archive/tasks/2026-11-15-arena-staged-partial-exits.md)。本轮延续 `main / 1ed41878` 的共享工作区，保留此前 v4 及其他任务修改。旧任务及模型失败证据保持历史原值。

## 语义与执行入口

v5 开放 `staged + on_each_fill`。父买单每次成交在同账户事务里更新各档稳定身份；每档额度为累计实际成交量乘比例、按手数向下取整、扣除该档累计已退出量，并受本计划余仓限制。额度耗尽或不足一手时进入 `waiting_parent / awaiting_parent_quantity`，后续买入只补新增额度；人工撤销或到期的档位不恢复。首次激活的期限不随额度增加延长。

撤入场余量或父单到期保留已买余仓保护。`afterExit` 保留两种明确政策：首次退出撤余，或继续允许入场。后一种政策下各档已退出量永久累计；止损清空当期余仓后，新买入才开始新的保护过程。止盈首次成交不取消余仓止损。旧持仓、OCO、全成分档与最小费规则保持。

修改生成 Schema、领域保护生命周期、数量投影、系统提示和共享中文说明；正式提交、实时仓储与 `LiveReplayRuntime` 继续消费同一领域状态机。没有修改 Prisma、migration、依赖、Dockerfile 或策略回测入口。价格研究预约仍只用于研究，不从摘要补订单。

## 固定样本与工程结果

| 验证 | 结果 |
| --- | --- |
| Schema 全包 | 149 文件、1605 测试通过，含真实生成信封组合、旧版本引用及账户兼容 |
| 领域全包 | 84 文件、867 测试通过；新增 9 例逐次分档覆盖累计额度、舍入、两种余量政策、恢复、老仓、期限和移动止损组合 |
| Server 定向 | 合同／提示／身份 23 测试通过，提示最后变动的 2 例再次通过 |
| 隔离 PostgreSQL 全组 | 最终 orders／replay／partial／advanced 四文件 18 测试通过；含 13 个固定配置正式提交、持久化与恢复回放，逐笔等同实时领域 |
| 新增并发撤余 | partial 文件 4/4 通过，新增入场与撤余按账户版本收敛、重读后取消，不丢已退出量或重复建档 |
| 前端与构建 | Desktop 相关 5 测试、生产构建，Mobile 类型，Schema／Domain／Server 构建和 Server 类型通过 |
| 工程门禁 | 最终全量复杂度／尺寸退出 0，3948 个源码、8 个工作区，无规则告警；边界与严格定向 lint 通过。保留既有 React Native Flow／codegen 解析提示和前端分包大小提示 |
| 双端浏览器 | 1440／1024／768／390，原有场景与逐次分档的等待额度、增量额度、零手数、中文配置、四页签通过；无页面错误和整页溢出 |

关键状态独立复核：买 10 时仅可止盈 3；卖 3 后保护 7；再买 10 时只新增 3 的止盈额度且保护 17；累计该档卖 6 后撤余保护 14；买满 27 后该档累计最多卖 9，余仓保护 18。已有 50 股 AAPL 不混入。

所有数据库写入仅在脚本创建的专属隔离库。本轮并发测试直接调用仓储，初版忘记模拟 Runner 收敛账户冲突周期，导致新建周期违反每账户单活跃周期约束；已补齐失败周期终态，再按新账户版本重读决策，未改变生产门禁。Desktop 验收初版在检查决策后未返回账户页便寻找委托页签，已修正测试导航；双端最终均通过。

截图位于 `/tmp/arena-staged-partial-qa/`，已目视复核 390 宽度的配置和等待额度状态。Mobile Web 不等于原生编译或真机验收；本次未改原生工程。

## 实际模型生成

生产 Runner／Call／Adapter 使用现有零费率本地 lmstudio 和 `qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive@q4_k_m`，无字段名的三条用户意图分别为全成分档、逐次分档保留入场余量、逐次分档首次退出撤余。系统提示与 Schema 正常提供字段合同，不从摘要修复配置。

| 私有目录 | 调用及结果 |
| --- | --- |
| `var/acceptance/arena-v5-staged-model-20261115-1400` | 1 资格探针 + 3 意图，输出上限 16384；全成及逐次保留余量通过，撤余例非法，整体 2/3 |
| `var/acceptance/arena-v5-staged-policies-20261115-1403` | 仅 1 次格式资格探针，模型在 8192 输出上限以 `length` 结束，未进入意图生成；真实资格未修改 |
| `var/acceptance/arena-v5-staged-policies-20261115-1407` | 同合同和上限有界重试资格，探针通过，1 探针 + 两种余量政策成对意图共 3 次调用，2/2 通过；原失败不覆盖 |

首轮失败的模型生成了正确的嵌套分档计划，但又复制为顶层卖单，并出现非法数量 `:{` 和重复身份，正式 Schema 拒绝，未提交。摘要还把比例描述为目标 9 股，不能用其替代累计实际数量。归类为模型非法输出，不是合同无法表达或引擎数量偏差。原始配置、请求审计和诊断保留。

首轮的两份合法配置和复验两份配置原样经过正式仓储、JSON、恢复回放，与领域实时撮合逐笔相等；分别保存在 `arena-v5-staged-replay-20261115-1412`、`arena-v5-policies-replay-20261115-1413`，新增模型调用 0。首轮非法例跳过，不计通过。

| 自然语言意图 | 模型配置与中文回读 | 原样配置执行结果 |
| --- | --- | --- |
| 全部买到再分档 | `on_full_fill + staged`，累计实际成交量的三分之一、扣本档已退出量、355 余仓止损 | 买满 27 后 375 档退出 9，继续保护 18，再于 350 退出；早期买 10 不激活 |
| 每次买到即分档，退出后保留入场余量 | `on_each_fill + staged + keep_entry_remainder`，本档当前额度耗尽等待新入场 | 买 10 后 375 档只退出 3、保护 7；再买 10 时仅补 3 档位额度、保护 17；累计买满 27 该档共卖 9，余仓 18 由止损退出 |
| 每次买到即分档，任意退出后撤入场余量 | `on_each_fill + staged + cancel_entry_remainder`，中文直接说明首次退出撤余 | 首次退出 2 股就撤掉未买 17，下一份行情再退出该档剩 1，余仓 7 继续止损，未继续买入 |

输入不提示字段名，实际模型结果逐批报告为 2/3、资格探针失败 1 次、成对复验 2/2，不合并成一次无失败生成。没有观察到合法配置在引擎中的执行偏差。

## 目标运行态与数据保护

正式 `AiProviderSaveService` 流程的计划、应用证据分别为 `var/acceptance/arena-route-v5-plan-20261115-1414`、`var/acceptance/arena-route-v5-apply-20261115-1415`。仅 lmstudio 的 `arena_live_research` 从 v4 升级到 v5，1 次本地零费率资格探针通过；其他用途路由、模型和凭证保持。目标 API 返回 `arena-live-research-v5 / native_schema / ready / passed`。

在 infra 执行 `./scripts/sync-code.sh thesis-ledger`，兼容性预检通过，Server 与 Worker 均健康；镜像 ID 保持不变，脚本未变更数据库结构或外部卷。这是开发容器可写层代码同步，容器重建后会恢复镜像代码，不作为生产镜像发布证据。本任务未修改依赖；共享工作区其他任务的 manifest 和锁文件修改保持原样，由正式入口执行兼容性判断。

容器内通过 `docker exec -i -w /app thesis-ledger-dev-thesis-ledger-1 node --input-type=module < scripts/local-runtime/arena-contingent-runtime-check.mjs` 执行独立模拟，写库 0。组合得到买入 20、退出 6、余仓保护 14，恢复与重复事件后子单身份稳定；原有全成保护 27、仅研究保留 27、部分成交 10/4/6、全成分档 9/18、附属 OCO、移动止损线 392、顺序建仓均通过。目标 Server／Worker 最近两分钟日志未发现错误、缺表或模块缺失。

历史失败周期保持 `failed / model_output_invalid`，同步前后完整行指纹相同：

| 周期 | `md5(to_jsonb(c)::text)` |
| --- | --- |
| AAPL `8241f49e-6d27-4f2b-a9c9-62272082bf1e` | `4a9ccfe1a068b0864008ba72513b481f` |
| TOPT `f849609b-8fd5-4e53-b805-03bac10c8d65` | `7cc34a5a63b8244a7fb1f69727c82ff7` |

本轮专用隔离数据库／容器已清理；两个受控 Vite 服务已停止。保留原始模型输出和失败诊断，没有改写真实账户或重新执行历史周期，没有暂存、提交或推送。

## 验证入口与范围

- PostgreSQL：`node scripts/test-ai-provider-postgres.mjs test/model-arena/live-orders-postgres.integration.test.ts test/model-arena/live-replay-postgres.integration.test.ts test/model-arena/live-partial-postgres.integration.test.ts test/model-arena/live-advanced-postgres.integration.test.ts`，最终四文件 18/18；日志 `/tmp/arena-v5-final-postgres.log`。
- 实际模型与原样回放：经 infra `scripts/infra.mjs locked --idle` 调用 `scripts/local-runtime/run-arena-contingent-model-acceptance.mjs`，各批输入与原始结果保存在上表私有目录；回放传入对应捕获目录，不调用模型。
- Provider：同一正式锁入口调用 `scripts/local-runtime/run-arena-research-route-upgrade.mjs plan|apply`；应用日志 `/tmp/arena-v5-route-apply.log`。
- 目标同步与容器模拟：`/tmp/arena-v5-sync.log`、`/tmp/arena-v5-runtime.log`；工程门禁 `/tmp/arena-v5-final-guardrails.log`、`/tmp/arena-v5-final-lint.log`；浏览器 `/tmp/arena-v5-desktop-browser.log`、`/tmp/arena-v5-mobile-browser.log`。

最终一致性复核覆盖生成合同→提交约束→累计额度／期限／撤余→账户事务及恢复→正式回放→共享中文投影→双端浏览器→目标代码与资格；全部符合本轮规格。模型非法输出仍可能发生，服务端会拒绝，不能宣称模型一次生成必然成功。成交量仍为已明确启用的模拟上限，不是订单簿流动性。策略回测是独立入口，本轮没有实现或验收该入口。
