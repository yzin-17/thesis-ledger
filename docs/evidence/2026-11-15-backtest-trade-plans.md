# 策略回测交易计划实施证据

状态：收盘计划的发现、自然语言编写和局部修改已通过实际模型、原样保存、冻结执行及目标 Server／Worker 复核。[Task](../archive/tasks/2026-11-15-backtest-trade-plans.md)保留其余未交付能力，整个任务仍活动。

## 执行入口与保护边界

本次使用现有 `main` 共享脏工作区，保留其他任务的修改，未暂存、提交或清理。竞技场历史决策和实际策略均未写入。模型验收读取真实 lmstudio 无凭证、零费率配置，先只在私有副本建立资格。独立 PostgreSQL 使用既有 `scripts/test-ai-provider-postgres.mjs` 创建和清理本次 tmpfs 容器，应用维护入口登记在 `scripts/deployment/maintenance.json`，经 infra 的 `scripts/infra.mjs locked --idle` 调用。用户随后明确授权三个策略用途的真实资格升级和正式同步，执行结果另列，不能与私有资格混为一项。

策略发现精简配置经过 `strategyOptimizationPrompt → AiSdkGenerationAdapter → assembleDiscoveryGeneration → StrategyCreationService`，保存完整不可变版本，再经 `DsaSnapshotBuilder → LocalSnapshotV3Runner → runExchangeVertical` 执行。首次试验误用了底层提示函数，未经过正式提示装配器，故只保留失败事实，不能算正式入口通过。自然语言编写另经 `authoringMessages → authoring-generation-v3 → validateAuthoringGeneration`，使用实际 8192 输出额度与 120 秒期限，再独立保存和执行。这里验证实际提示、合同与业务校验，没有创建真实编写队列任务。

## 固定样本

- 冻结 ATR 使用入场委托生成时最后可见值，后续 ATR 从 2 变为 20 不放宽保护；缺失或未来 ATR 不发单。
- 峰值 120 的 5% 保护线保持 114，回落到 116 不降低；触发后按后续开盘与原滑点成交，不承诺 114。
- 8% 保本、15% 启用追踪；风险清仓、普通退出、减仓、加仓按优先级运行。加仓保留原始数量与已完成阶段。
- 剩余数量阶段首次目标冻结，已成交累计扣减；重复成交不重计，拒单不计完成。只有最后一笔实际退出后才开始冷却。
- 风险预算：10 万权益的 1% 除以距离 2 得 500，20% 投入封顶后 200；缺权益或正距离报告不可用。
- 事件队列与账本产生买 200、减 100、追踪退出余下 100，逐笔复跑一致。正式快照 Worker 另用显式费用和归一化单位，不混称实际股票份数；禁止冻结后调用新行情。
- 纯常量比较可表达恒假普通退出；价格或持仓数量与常量的原单位检查继续保留。
- 原始数量样本买入 300；25% 阶段不足一手跳过，50% 阶段向下取整卖 100，随后剩余一半卖 100，保留 100。零手阶段不会反复拒单饿死后续动作；归一化单位不作手数取整。
- 只支持全量冻结重放。移除未接入真实持仓恢复的检查点构造参数，避免把纯状态初始化误称进程恢复能力。实际撮合仍是整笔或拒绝。

## 实际模型与原样回放

所有意图不提供字段名。格式探针与业务生成分开，原始私有 JSON 不覆盖。

| 捕获目录（`var/acceptance/`） | 输入／结果 | 证据层级 |
| --- | --- | --- |
| `backtest-trade-plan-20261115-1500` | 验收夹具误将费率元数据传给严格输入，未发送模型 | 脚本失败，独立资源已清理 |
| `backtest-trade-plan-20261115-1505` | 通用最小实例探针 Schema 不匹配 | 格式资格未过，未写回 Provider |
| `backtest-trade-plan-20261115-1510` | 固定实例格式探针通过；业务提示遗漏正式装配。含非法结构、截断及合法但错误的配置 | 不能算正式生成入口通过；保留用量、配置和诊断 |
| `backtest-trade-plan-20261115-1520` | 正式提示四份生成合法；冻结执行暴露恒假常量比较的单位兼容缺口。固定保护样本额外配置了追踪，保护样本止损冷却写成 0 | 原始失败，不能将格式成功当业务理解成功 |
| `backtest-trade-plan-replay-20261115-1525` | 原样使用 1520 的两份分批配置，不新增模型调用。先卖 25%，再卖最初数量 50% 或剩余数量 50% | 正式保存、冻结 Worker、离线复跑通过；第二档分别为初始数量的 50% 和 37.5%。但模型另加了风险预算，故不能判定完整意图通过 |
| `backtest-trade-plan-20261115-1530` | 固定样本另加普通退出，两份还重复独立成本价止损 | 原判断漏查额外规则，不能算完整意图通过；receipt 原样保留 |
| `backtest-trade-plan-20261115-1540` | 初始基数、固定和追踪样本额外生成风险预算；剩余基数样本重复成本价止损 | 模型选错合法结构；后者原 receipt 漏查，已纠正验收断言 |
| `backtest-trade-plan-20261115-1550` | 3 次业务生成及 1 次探针；追踪样本无独立风险，通过。初始基数和固定样本仍重复成本价止损 | 独立成本价含买入费用，不能与首笔成交价止损视为相同规则；保留原错误判定 |
| `backtest-trade-plan-20261115-1640` | 3 次业务生成及 1 次探针；初始基数、剩余基数、固定保护全部通过 | 修正精简示例的隐含风险，提示明确两种锚点区别；全配置、原样保存、Worker、全量复跑均通过 |
| `backtest-trade-plan-authoring-20261115-1555` | 完整编写的固定／追踪计划可表达，但覆盖路径含类型判别值，追踪还多加基准 | 业务校验拒绝；原输出保留。正式生成 Schema 随后对齐禁止额外基准和实际覆盖路径 |
| `backtest-trade-plan-authoring-20261115-1600` | 追踪完整生成、保存和执行通过；固定触及 120 秒期限 | 不提高期限。旧日志“用户取消”实际来自超时，后续改为按超时原因分类 |
| `backtest-trade-plan-authoring-20261115-1610` | 固定再次触及 120 秒期限 | 保留失败。分析用量后删除提示中重复 AST Schema，未放松输出合同 |
| `backtest-trade-plan-authoring-20261115-1620` | v10 固定保护完整生成、业务校验、原样保存和快照执行通过 | 1 次格式探针及 1 次业务调用；固定止损不含额外普通退出、独立止损或风险预算 |
| `backtest-trade-plan-authoring-20261115-1650` | v10 追踪保护完整生成、业务校验、保存和快照执行通过 | 1 次探针及 1 次业务调用；与固定使用相同输出额度、期限与合同，原始提示分别保存 |
| `backtest-trade-plan-authoring-readback-20261115` | 原样重用 1620 固定输出，新增费用中文后零模型调用重跑 | 保存、Worker 和完整回读通过，不把重放记为新模型理解样本 |
| `backtest-trade-plan-final-readback-20261115`、`backtest-trade-plan-final-trailing-20261115` | 原样重用 1640 三份配置及 1550 的追踪配置，零调用 | 最终数量单位及费用回读、完整执行结果和重复复跑通过 |
| `backtest-trade-plan-modification-20261115-1700` | v11 局部修改，1 次探针及 2 次实际业务调用，约 226 秒完成整组 | 固定改追踪、追踪改固定均通过精确范围校验；所有其他根不变，保存、快照 Worker 和重复回放通过 |
| `backtest-trade-plan-modification-replay-20261115` | 原样复用上一组完整模型输出，零调用 | 验收编排提取职责后的独立数据库保存和冻结回放通过，未修改模型输出 |

原始／剩余数量配置的完整中文直接展示入场、普通退出、金额或权益比例、独立风控、计划保护、数量基数、费用及冷却。已有错误样本中的“已持仓才入场”“货币金额 0.20”和重复成本价止损按配置原样显示，不用模型摘要美化。MACD 参数按名称读取，不依赖 JSON 键顺序。保存这些失败的意义是核对模型选择和验收遗漏，不将错误结构自动修成成功样本。

局部修改的原始意图分别为“取消跟随最高收盘价的保护，改为固定在最初买入成交价下方5%，上涨也不移动。其他规则全部不变。”及“初始保护仍在最初买入成交价下方5%，改为盈利达到10%后跟随最高收盘价下方5%上移，永不下移。其他规则全部不变。”输入不提示字段名。相同行情中，固定保护在后续 8 元开盘按滑点成交 7.992，追踪保护在更早的 11 元开盘成交 10.989；数量均为 20000 研究单位。原始配置、修改前配置、完整差异、中文和逐笔事实随样本保存。保留原需求及普通退出摘要，不把其旧计划文字当作本次修改意图，也不自动添加其他来源或独立止损。

固定范围测试还覆盖未配置计划时新增、移除后用 JSON `null` 表示差异、无实际变化拒绝、32 档超过 2000 字符仍保留完整差异，以及拒绝越界修改来源、普通退出、仓位、独立风险、费用或名称。ATR 来源缺失时不能通过计划局部修改补来源。

## 验证记录

命令均从主仓执行；持锁维护从相邻 infra 执行，目标仅独立验收库。

| 命令／范围 | 最后结果及限制 |
| --- | --- |
| `pnpm --filter @thesis-ledger/domain test` | 88 文件、885 测试通过；最后中文成本锚点变更后定向 3 文件、11 测试通过 |
| `pnpm --filter @thesis-ledger/schemas test` | 局部修改合同收尾后仍为 150 文件、1609 测试通过；日志 `/tmp/backtest-plan-modification-schemas-full.log` |
| Server 定向计划／正式提示／Worker | 已通过；提示固定消息上限变更与原因见 Spec |
| `pnpm --filter @thesis-ledger/server test` | 4613 通过、525 跳过、10 失败。当前任务的合同版本期望已更新；独立重跑预热测试 1/1 通过。其余旧 Runner 版本期望、Journal、迁移 head 与接口登记属于已有工作区改动，不宣称全仓通过 |
| `node scripts/check-boundaries.mjs` | 通过；浏览器夹具由各端持有，不互相跨应用 import |
| `GUARDRAIL_BASE_REF=HEAD node scripts/check-file-size-guardrails.mjs` | 通过。提取精简生成合同、信号选择与交易所仓位装配，未提升复杂度／文件阈值 |
| `NODE_OPTIONS=--max-old-space-size=8192 node scripts/lint-workspace.mjs --guardrails` | 最后 8 组、3978 文件通过。既有 React Native 依赖解析日志与警告保留，退出为 0；未放宽门禁 |
| Server 构建／类型、Desktop 构建、Mobile 类型 | 最新通过，日志 `/tmp/backtest-plan-{server-build-final3,server-types-final3,desktop-release4,mobile-release3}.log`；不替代目标容器或原生真机 |
| `backtest-trade-plan-browser.mjs` | 1640 发现配置及 1650／零调用固定编写配置：Desktop 和 Mobile 原生组件 Web 宿主，1440／1024／768／390 检查中文、溢出和页面异常；最后截图位于 `/tmp/backtest-trade-plan-browser-release3/` 及两个 `authoring` 目录 |

最新局部修改定向测试为 5 文件、16 测试通过（`/tmp/backtest-plan-modification-entry-tests.log`），覆盖原有修改语义、提示、实际输出结构和计划范围。Domain 最后定向为 3 文件、11 测试通过（`/tmp/backtest-plan-domain-acceptance-last.log`）。Server／Desktop 构建、三端类型和定向 ESLint 通过；最后 Server 类型日志为 `/tmp/backtest-plan-server-types-acceptance-last.log`。旧的试跑命令曾传入不存在的测试路径，只执行了匹配到的文件；上述结果已使用实际路径重跑，不能把未匹配路径算作已验收。

最新全仓 guardrails 为 8 组、3981 文件通过（`/tmp/backtest-plan-guardrails-last.log`）。新增计划回读、实际模型验收编排和摘要中的复杂分支已收敛；保留另一任务 `backtest-rule-compatibility.test.ts` 的既有函数长度警告及 React Native 依赖解析日志，未关闭规则。最后尺寸无警告、依赖边界及 workspace 依赖检查通过，`git diff --check` 通过，暂存区为空。

最后的配置页面检查在 `/tmp/backtest-trade-plan-browser-final-pages2/`、`...-final-fixed2/`、`...-final-trailing2/`：包含 Desktop 摘要、实际版本详情页四个页签往返和 Mobile Web，均覆盖四种宽度。版本详情将计划合为一个中文字段，避免逐行重复标题。局部修改预览在 `/tmp/backtest-plan-modification-browser2/`：两份实际模型修改配置、两端各四种宽度，核对修改前后每条中文、选择范围、采用／放弃、键盘打开选择及横向溢出；390 宽截图已人工检查。这里采用／放弃使用本地受控回调，真实策略只读。Mobile 使用现有选择器的字体选中态作断言，不将 Web 宿主当成原生设备验收。

浏览器夹具曾将 Vite 源码路径误当 API 拦截，导致 JSON MIME 失败；修正为仅拦截 `/api/` 后通过。局部修改首次浏览器断言假设现有 React Native Web 选择器输出 `aria-checked`，实际该属性缺失；改为检查真实字体选中态，完整重跑通过。两类失败属于夹具／现有 Web 投影，未修补模型配置来通过验收。

## 真实资格与目标运行态

规划 `var/acceptance/backtest-trade-plan-route-draft-20261115/plan.json` 仅涉及 lmstudio 的发现、编写生成和编写修改三个用途：v2 → v3、原生 Schema、手工模式。用户授权后，`run-strategy-trade-plan-route-upgrade.mjs apply` 经正式锁、`AiProviderSaveService.plan/testAndSave` 执行，3 次零费率格式探针全部通过，结果在 `backtest-trade-plan-route-applied-20261115/result.json`。比较保存前后，只有 `executionRoutes`、`generationValidation` 变化，其他 Provider 配置及用途路由保留。格式探针与上方两次真实局部修改业务生成分别验收。

最终 `sync-code.sh thesis-ledger` 已通过兼容预检、workspace／Server 构建和两个服务健康检查，日志 `/tmp/backtest-plan-sync-modification-final.log`；此前两次日志 `/tmp/backtest-plan-sync.log`、`/tmp/backtest-plan-sync-final.log` 保留。Server／Worker 镜像标识保持不变；这是容器可写层快更，不宣称生产镜像或发布更新。目标 HTTP readiness 已确认三个真实用途均为 v3、`native_schema`、资格 `passed` 和状态 `ready`。Docker 3000 根路径不提供 Desktop 页面；页面验收使用独立 Web 宿主，不混称部署后的 Desktop 验收。

目标验收工具为 `run-backtest-trade-plan-runtime-check.mjs`：在既有 Server 和 Worker 容器中执行相同独立冻结快照，核对编译模块哈希、合同版本、完整结果、重复重放及中文。只在进程私有临时目录解包受控数据，并在 `finally` 清理；模型调用和业务数据库写入均为零。此项不创建真实队列回测任务，不代表未变更的任务投递／领取生命周期重新验收。

最终回执 `var/acceptance/backtest-trade-plan-target-complete-20261115/receipt.json`：四份发现、两份完整编写及两份局部修改配置，分别在目标 Server 和 Worker 中全部通过；17 个编译模块哈希、完整结果、重复重放和中文一致，三个真实 v3 用途资格就绪。日志 `/tmp/backtest-plan-target-complete.log`。回执保留每份样本来源目录，不将同名固定／追踪样本混为一份；模型调用 0、业务数据库写入 0。此前五份样本的目标回执继续保留，不能替代本次八份复核。

尚未交付：净亏损窗口暂停、动态波动率仓位、会话／月末调仓、一般条件及逐期 ATR 风控、限价／触价／OCO／到期撤单／实际部分成交、中途检查点恢复。分别保持 Task 未勾选，不移入 TODO。新的局部修改入口已独立通过实际模型和 Web 预览，不据此扩大上述能力范围。

## AC09 成交净收益窗口与交易日暂停增补

本节独立于上方 v3 验收。用户确认成交净收益扣除买卖费用，现金分配单独记账、不影响亏损判定。新增 `tradePlan.lossPause`，窗口只由实际接受的账本成交推进，累计同一持仓周期每次实际卖出的已实现净收益；最后一份卖出才计一笔，加仓不清零。重复成交幂等，零收益不算亏损；只在新的完整平仓事件上触发，不由旧窗口反复暂停。暂停排除平仓日、跳过冻结日历的休市日，阻止随后 N 个完整交易日新开仓，第 N+1 日重新检查；不按日线或盘中行情根数计时。日历缺失、覆盖不足、不可见均保守不入场并记录原因。

实际接缝为 `ledger.applyEvent → result.applied/result.realizedPnl → BacktestTradePlanRuntime.accept`；Server 从同一执行模型冻结事实构建 `tradePlanCalendar`，研究快照显式使用已有 `dataAsOf`，严格模式按决策时点验证可见性。没有读取事后交易报告，没有推算净成本或使用摘要补配置。

定向测试覆盖分批净收益累计、加仓、重复成交、完整与未平仓、零收益、周末／假期、日历中间缺口、未来事实、美国夏令时及中文。真实引擎用三次买 200 股、每股 10 元，卖价 10.10 元、每边最低佣金 30 元，毛盈利 20 元变为每笔净亏损 40 元，实际触发暂停。相同交易加入每股 1 元现金分配，账本未结算现金增加 200 元，但窗口、成交和暂停完全一致；未配置暂停时保留原有开仓行为。首次现金测试误断言为已结算现金增加，按既有账本支付时钟更正为未结算现金断言，未改变现金规则；原失败日志 `/tmp/loss-pause-ledger-tests.log` 保留。

固定快照对照使用明确模拟的 32 个交易日及恒定价格，费用使每个完整周期净亏损。每次平仓等十根日线的买入日为 5 月 19 日、6 月 4 日、6 月 22 日；最近三笔全亏后停十个交易日的买入日为 5 月 19 日、21 日、25 日、6 月 11 日、30 日。6 月 30 日来自新的亏损完整平仓再触发，不是旧窗口重启。`loss-pause-worker.test.ts` 两例经正式冻结、真实 `LocalSnapshotV3Runner` 和重复回放通过；冻结后行情读者一旦访问即抛错。

### 当前验收结果

- Domain 全包：90 文件、895 测试通过（`/tmp/loss-pause-domain-full.log`）；Schemas 全包：151 文件、1610 测试通过（`/tmp/loss-pause-schema-full.log`）。Server 构建与类型通过（`/tmp/loss-pause-server-build.log`、`/tmp/loss-pause-server-types3.log`）。
- 冻结 Worker 及提示合同定向通过。首次提示 17010 字节超限，精简后保持 16000 字节门禁通过；未提高业务输出额度和超时。修改前失败日志保留。
- 实际发现 `backtest-loss-pause-discovery-20261115`：1 次私有 v4 格式探针、2 次无字段名业务生成均通过。`bar-cooldown` 只生成根数冷却，`loss-window` 只生成净亏损交易日暂停；原样保存、快照 Worker、完整结果复跑和中文分别一致。Provider 与历史业务写入为零，隔离策略版本写入不混称零写入。
- `backtest-loss-pause-browser-discovery-20261115`：上述两份实际输出在 Desktop 摘要、真实版本详情组件及 Mobile Web 宿主覆盖 1440／1024／768／390，中文逐条、页签往返、溢出和页面异常通过，390 版本截图已检查。不代表原生真机或目标 Desktop 已部署。
- 14 个本阶段相关 TypeScript 文件定向 ESLint 零错误／警告；尺寸、依赖边界、workspace 依赖和 `git diff --check` 通过。默认堆运行全仓复杂度检查时 Server 组内存不足，已按项目上一阶段的 8 GB 配置重跑，不能用定向检查替代全仓结论。

### 实际编写／修改及最终回读

| 目录（`var/acceptance/`） | 结果与归因 |
| --- | --- |
| `backtest-loss-pause-authoring-20261115` | v12 生成的根数冷却通过；净亏损样本虽然暂停结构正确，但把确认的 `159516.SZ` 改成裸代码，普通退出还错误变成恒假。完整定义 Schema 可表达原意，属于模型选错合法结构；正式确认校验拒绝，未保存或补写该失败配置。原配置和中文保留。 |
| `backtest-loss-pause-authoring-p13-20261115` | 正式提示明确逐字复制标的、暂停不替代普通退出。1 次探针及 2 次无字段名业务生成均通过，保持 8192 输出额度和 120 秒期限；确认条件、覆盖、原样保存和 Worker／重复回放通过。 |
| `backtest-loss-pause-modification-20261115` | 1 次探针及 2 次业务调用通过；从根数冷却改为净亏损交易日暂停，以及反向修改，均只产生 `tradePlan` 根差异。其他根及确认摘要完全不变。原始提示使用当时 v12，原样留存，不伪称重跑 v13。 |
| `backtest-loss-pause-{discovery,authoring,modification}-final-20261115` | 三组原始输出分别零模型调用复跑。只调整显示：未配置根数冷却时不额外显示“与平仓冷却同时满足”。各两份配置在独立 PostgreSQL 原样保存、冻结 Worker 和重复回放通过，最终中文从配置直接生成。 |

本批共 4 次私有格式探针、8 次实际业务生成，合计 12 次配置费率为零的 lmstudio 调用。原失败不覆盖，实际生成与零调用回放分开；其中净亏损窗口和根数冷却各有发现、完整编写、局部修改一份成功配置，共六份。失败样本不计为通过，也不因选对暂停字段而忽略代码或退出错误。没有从摘要推断、添加或修复交易。

最终浏览器目录为 `backtest-loss-pause-browser-{discovery,authoring,modification}-final-20261115`：发现及编写各 24 张截图（两份配置 × 摘要／实际版本组件／Mobile Web × 四种宽度），双向修改 16 张（两份 × 双端 × 四宽），合计 64 张。逐条核对最终中文、四页签往返、修改范围选择、受控采用／放弃、横向溢出和页面异常；390 宽版本页及修改预览已实际检查。这里仍是独立 Web 宿主与受控数据，不冒充目标 Desktop、真实编写队列或原生真机。

并行执行最后三组浏览器检查时，编写组已输出两例完成、24 张截图及全部页面断言，但浏览器退出清理挂住；结束的仅为已核对命令行的本轮进程，原日志保留。随后编写组单独重跑至 `backtest-loss-pause-browser-authoring-final2-20261115`，相同原始配置和断言约 22 秒完成，退出 0（`/tmp/loss-pause-browser-authoring-final2.log`），无新模型调用。该最后一组以独立重跑为最终脚本退出证据，不把原进程的强制清理记为正常退出。

最终补充检查：Domain 中文／净收益定向两文件 10 测试通过；原有发现／编写／修改／判定定向四文件 9 测试通过；v13 提示的编写／修改定向通过。Server 构建更新至 v13（`/tmp/loss-pause-server-build-p13.log`），Domain 显示更新后构建通过。Domain、Schemas、Server、Desktop、Mobile 类型及 Desktop 构建通过，未修改原生依赖。8 GB 全仓 guardrails 为 8 组、3988 文件通过；新增模型夹具的复杂度 21 警告已提取明确的入／退出核对职责，并在相同 complexity=20 门禁下零警告，保留另一任务的存量函数长度警告。未提高任何工程阈值。

### 真实资格规划与待验收边界

`backtest-loss-pause-route-draft-20261115/plan.json` 已通过正式锁和 `AiProviderSaveService.plan` 准备：仅 lmstudio 的策略发现、编写生成和编写修改由各自 v3 升为 v4，保持 `native_schema`／手工策略，预计 3 次零费率本地探针；其余路由经深比较完全一致。只读规划不调用模型，不写回真实 Provider。此前授权对应具体 v3 规划；新的真实 v4 资格与 `sync-code.sh thesis-ledger` 等待明确授权。未同步前，目标继续保持原有 v3，就绪证据不能借用到新字段。

授权后的具体核对入口已经准备：`run-backtest-trade-plan-runtime-check.mjs` 新增净亏损 helper 和冻结日历接缝哈希，共 19 个模块；在既有 Server／Worker 分别执行新增六份和原有八份冻结样本，核对完整结果、重复回放、中文和三个 v4 用途 readiness。它不创建真实队列任务。T04a.4 保持未勾选，不提前写目标通过；其余 T04 能力继续活动，不移入 TODO。

### v4 已授权正式保存与目标验收结果

用户明确允许按上述规划升级到 v4 并同步验收。首次正式锁返回已有更新锁，未进入保存流程（`/tmp/loss-pause-route-apply.log`）；锁随后自然释放，未删除或改写锁。第二次从 infra 执行 `STRATEGY_ROUTE_UPGRADE_AUTHORIZED=1 node scripts/infra.mjs locked --idle -- node ../thesis-ledger/scripts/local-runtime/run-strategy-trade-plan-route-upgrade.mjs apply <独立输出目录>`，约定的三个用途原生探针全部通过并正式保存，其他用途保持原值。回执 `var/acceptance/backtest-loss-pause-route-applied-20261115/result.json`，日志 `/tmp/loss-pause-route-apply2.log`；另 3 次配置费率为零的本地格式探针不混入上方业务理解样本。

随后从 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行 `./scripts/sync-code.sh thesis-ledger`，退出 0；兼容性预检、workspace／Server 构建、Server 和 backtest-worker 健康检查均通过，日志 `/tmp/loss-pause-sync-v4.log`。镜像保持 `sha256:145d6f91a4ef7c3eaac801f26c89ac42fa446ccfb24c54ff67c03d8b87f0e4c2`；仅容器可写层快更，无数据库结构或外部卷变化，不宣称镜像发布完成。

目标回执 `var/acceptance/backtest-loss-pause-target-v4-20261115/receipt.json` 及日志 `/tmp/loss-pause-target-v4.log`：经正式锁执行 `run-backtest-trade-plan-runtime-check.mjs`，两个实际容器各重放新增六份与原有八份独立冻结样本，19 个模块哈希、完整结果、重复重放及中文全部一致；HTTP readiness 的发现／编写生成／修改各自 v4 均为 `ready`。模型调用 0、业务数据库写入 0，临时文件清理。未新建真实队列任务，不扩大为队列生命周期、目标 Desktop 或原生真机验收。T04a 至此完成，Task 继续推进已确认每日主动调仓的 T04b。

## AC10 每日目标波动率实施与独立验证

用户选择每日收盘主动调仓后，先在规格固化简单收益、样本标准差、252 年化、N+1 收盘及互斥组合，再修改代码。`backtest-trade-volatility.ts` 独立计算统计窗口，冻结日历可见性由 `backtest-trade-plan-calendar.ts` 统一读取；亏损暂停复用同一读取合同，行为未改。`backtest-trade-volatility-action.ts` 只读决策时账户投影，调用现有 `computeSizing(targetWeight)` 取得实际方向和目标差额，不产生探测委托。运行时将方向与数量冻结到真实信号，随后开盘仍执行原账本、成本、资金、手数及可售约束。初始保护、风险和普通退出先于调仓，加仓不重置入场锚点。正式预热规划读取 `strategyRequiredLookback` 的 N+1 窗口；不从事后报告倒推权益或读取未来开盘。

### 固定输入结果与修正归因

- Domain 统计四例验证相同均值下波动翻倍、未封顶权重减半；样本分母 N-1、最大权重、极小非零波动、20 收益需 21 收盘、坏样本保留窗口、整交易日缺口、重复日期、未来样本、零波动和冻结研究截点。日线以外、不可见日历及不可用价格均不新增投入，不回退常量仓位。
- 实际账本三例验证先买、减仓、再增仓，原始股数按 100 股手数；相同收盘把下一开盘改为跳空时，首次数量仍相同。风险与普通退出优先；T+2 不可售导致拒单，次日重新计算后才实际卖出。重复行情不新增经济成交，相同完整输入的成交标识与结果精确一致。
- 初次夹具使用错误的权益键 `value` 而非实际 `amount`，以及不符合真实价格格点的 `9.999` 开盘，分别造成不可用权益和价格拒绝；修正夹具为真实合同，没有放宽执行约束。注入额外重复事件会改变全局意图顺序编号，因此该断言改为比较方向、数量、价格、日期、原因和费用；相同输入仍检查完整记录一致。失败日志 `/tmp/volatility-execution-tests*.log` 保留。
- `volatility-target-worker.test.ts` 两例使用同一独立模拟行情：普通固定 50% 仅一笔买入；每日目标在波动上升后减仓、回落后增仓。正式 Builder 的预热分别为 1／21，真实 `LocalSnapshotV3Runner` 两次完整结果相等，冻结后行情读取即抛错。此处为本地实际 Worker 实现，不冒充已同步目标容器。
- 最新定向 Domain 四文件 18 测试、Schemas 三文件 12 测试、Server 五文件 21 测试通过。Domain 全包 92 文件／903 测试通过（`/tmp/volatility-domain-full2.log`）；Schema 全包首次仅因旧版本断言仍写 v4 失败，已修正为当前 v5 并补 v4 历史读取断言，最终复验另记。Server 类型通过，局部 ESLint 零警告。新增统计／动作职责独立成文件，未扩大超限旧引擎职责。

### 发现入口实际模型与验收器修正

从 infra 正式持锁执行应用维护的 `run-backtest-trade-plan-acceptance.mjs`，环境 `BACKTEST_PLAN_SCENARIO=volatility-target`、`BACKTEST_PLAN_ENTRY=discovery`。目录 `var/acceptance/backtest-volatility-discovery-20261115` 保存 1 次私有 v5 格式探针、2 次不提示字段名的业务生成及原始报告。固定样本仅买入一次；动态样本明确生成 20／10%／50%／252／简单收益／样本／每日配置，实际 54 笔调仓；全部经过正式装配、隔离 PostgreSQL 原样保存及冻结 Worker／重复回放。

原报告把固定样本的恒真入场及动态样本被覆盖的普通 25% 投入误判为结构失败。审查运行时发现首次入场受空仓门禁，恒真与空仓许可等价；动态计划替代普通仓位，而原始动态意图只指定目标与上限，并未指定被覆盖字段。修正的是验收器，未改模型输出、执行代码或提示。新增判定测试接受这两种等价结构，仍拒绝恒假入场、即时普通退出和固定意图误选每日计划。零模型调用复跑到 `backtest-volatility-discovery-readback-20261115`，两份均通过，原误报继续留存并明确归因，不作为模型真实语义失败计数。

完整／精简新合同为 v5，编写／优化提示当前 v17／v5；真实 Provider 及目标目前仍为 AC09 已验收的 v4。中文逐条读取配置，说明 N+1 样本、公式、每日主动增减、普通仓位被替代、无效／零波动及后续开盘偏差；价格研究摘要和版本的主要仓位行也显示每日目标，避免普通投入与实际计划混淆。不借 v4 授权自动开放。

### AC10 后续批次及当前缺口

- `backtest-volatility-authoring-20261115` 和 `backtest-volatility-modification-20261115` 各含 1 次私有格式探针及 2 次实际业务生成；编写及双向局部修改均通过正式校验、隔离保存、冻结 Worker 和重复回放。原始提示属于 v14 时段，后续提示变更与共享预算改动的最终复验单独记录，不把旧结果称为当前源码目标运行态。
- 为遵守发现 16000 字节门禁，曾压缩共享提示。`backtest-volatility-discovery-compact-20261115` 的动态输出把 10%／50% 写为字符串 `"10"`／`"50"`，并将布尔持仓状态与数字比较，正式 Schema 正确拒绝。这是模型结构错误，合同本身能够表达；没有修复模型输出。移除冗余 Schema 描述、恢复明确的小数比例及布尔 AST 示例后，固定消息预算仍通过；`backtest-volatility-discovery-explicit-20261115` 的新实际两例全部通过，固定仅一笔买入、动态按波动增减。原始错误和成功输出均保留。
- 分析入口独立验证“每日调仓”与“只在开仓按波动定仓”。早期夹具遗漏超时对象导致调用前失败，修正夹具；输入补齐明确标的及费用后仍保留真实模型失败：`backtest-volatility-analysis-confirmed2-20261115` 拼接引用导致正式分析拒绝；`backtest-volatility-analysis-p15-20261115` 每日例引用含省略号，开仓例虽然引用合法，却错误解释为每日更新；`backtest-volatility-analysis-p16-20261115` 每日例通过、开仓例又改写标的引用并选错执行含义。均保留原响应，不解析或修补摘要。当前 v17 将分析提示独立为 `authoring-analysis-prompt.ts`，保留实际条件合同与能力说明，移除生成配置的干扰指令；真实成对复验进行中。此缺口未通过前，T04b.3 不勾选。
- 当前发现样本浏览器回执日志 `/tmp/volatility-browser-discovery-final.log`：Desktop、版本及 Mobile Web 各 2 例 × 4 宽，共 24 张截图，中文一致、无脚本错误或横向溢出；已查看 390 宽动态版本／手机截图。早期因空计划中文变化的等待失败与遗漏验收 Vite 配置的 Mobile 404 分别保留，后者为验收环境错误。编写／修改最终截图另记，不据此宣称原生真机。
- Domain 全包 94 文件／909 测试（含月末日历四例）、Schemas 全包 152 文件／1612 测试通过，日志 `/tmp/volatility-domain-full-with-month.log`、`/tmp/volatility-schemas-final-explicit.log`。当前分析／修改／发现提示定向 20 测试通过（`/tmp/volatility-p17-regression.log`）。Server 构建、三端类型和 Desktop 构建已有分层通过证据，后续有输入变化时重新验证受影响层。
- 共享工作区并行新增了含费用的实际投入上限，保留该实现。跳空买入可能被上限缩量，原先固定成交 200 股的断言现验证真实 100 股；冻结目标不放大、成交按实际约束减少。`tradePlanSizing` 的最终数量投影提取成独立函数以收敛复杂度；提取与并行变更短暂交错的未传 `plan` 错误已修正。最新相关 15 个定向测试通过，失败日志 `/tmp/volatility-sizing-extract-tests.log`、成功 `/tmp/volatility-sizing-extract-tests2.log` 分开保存。旧模型配置和原失败数据保持原值，最终目标验收前须以当前执行实现重放受影响捕获。

## AC11 月末调仓接续

用户选择最后交易日收盘判断、随后首个可交易开盘执行，偏离达到 3 个百分点时才调回 30%；已写入 Spec 的 AC11 和 Task 的 T04c 四阶段。新增 `backtest-trade-month-end.ts` 只读冻结日历，完整枚举月份核对覆盖，读取实际会话完成时刻；没有接入策略 Schema 或订单执行，不能视为月末能力完成。四例定向测试覆盖月末假期／周末、非月末、午休、提前收市、整月覆盖缺失、来源可见性、冻结研究截点及美国夏令时／冬令时。日志 `/tmp/backtest-month-end-calendar-tests.log` 通过。继续接入与模型验收前保持 T04c 未完成。

### AC10 当前实际模型与共享输入复验

分析 v17 的 `backtest-volatility-analysis-p17-20261115` 两例通过：每日主动调仓明确支持，仅开仓定仓明确为 `unsupported`，原文引用全部通过正式校验；没有生成配置或订单。这是合同能力缺口被模型识别的对照，不能计作仅开仓功能已实现。分析提示已独立，后续 v18 仅修改生成提示，分析消息不变，复用该输入证据。

`backtest-volatility-authoring-p17-20261115` 动态例通过，固定例生成 `constant.value="false"` 被拒；单例 `backtest-volatility-authoring-p17-fixed-retry2-20261115` 虽改正退出，却漏掉 v3 必需的来源坐标，同样被正式 Schema 拒绝。v18 明确恒假退出必须是十进制常量比较，未放宽合同或修复输出；`backtest-volatility-authoring-p18-20261115` 两份全新实际生成均通过原样校验、隔离保存、冻结 Worker／重复回放及中文。原失败捕获继续保留。当前双向修改 v18 的实际批次单独进行。

共享资金上限引入后，动态 Worker 用例的两次完整回放和一次实际执行超过 Vitest 默认 5 秒。改为明确的 30 秒集成时限后仍失败，未继续加大；CPU profile 显示热点为 `factLocalDateTime` 重复创建 `Intl.DateTimeFormat`。现由每份冻结日历复用同一格式化器，只缓存格式化配置，不缓存或改写日期事实。`/tmp/volatility-worker-calendar-cache.log` 两例通过，动态三次执行合计约 8.8 秒；业务调用期限、40 位数量搜索、结果和冻结回放断言保持原值。Domain 全包 95 文件／912 测试通过。完整 guardrails 8 组／4007 文件通过，仅保留旧兼容测试函数长度警告及原 React Native parser 提示，文件尺寸无警告；日志 `/tmp/volatility-guardrails-calendar-cache.log`。新增月末动作 helper 在该全包之后增加，单独验证，不混入此统计。

随后以原始生成捕获为输入，使用正式维护入口的捕获复跑模式，模型调用为 0，输出到 `var/acceptance/backtest-plan-budget-replay-*-20261115`：首批发现／编写／修改八份、亏损暂停三个入口六份、目标波动率发现和编写四份，共 18 份全部通过当前代码的正式校验、独立保存、冻结 Worker／重复回放与中文回读。各目录的 `receipt.json` 及 `/tmp/plan-budget-replay-*.log` 留存。历史目录不覆盖，先前 v4 目标回执仍只证明当时输入。

AC11 另外新增 `backtest-trade-monthly-action.ts`，以精确权益价值差与阈值乘积比较，恰好 3 个百分点执行、2.99 个百分点跳过，复用目标权重数量投影；非月末不读账户。两例验证双向偏离、贴近目标不足一手也应跳过、空仓目标、未知日历和未来价格，连同日历共六例通过（`/tmp/backtest-monthly-action-tests3.log`）。尚未接入正式 Schema 和执行信号，T04c 保持未完成。

### AC10 v18 最终消费及正式规划

`backtest-volatility-modification-p18-20261115` 两次新业务生成与私有格式探针全部通过，双向仅改变交易计划根，原普通 50% 仓位等其他根保持原值；独立保存、冻结执行及完整重复回放一致。与当前发现、编写样本组合，目标验收输入共 20 份，历史 18 份已按共享含费预算零调用更新回执。

最终页面为 `backtest-volatility-browser-config-{discovery,authoring,modification}-20261115`：前两组各 24 张、修改组 16 张，共 64 张。先验证捕获中文等于当前配置投影，再逐条检查实际摘要、版本和双端修改预览；覆盖 1440／1024／768／390、页签往返、受控采用／放弃、横向溢出及页面异常。已实际查看最终 390 宽版本与 Mobile 修改页。此前页面脚本按前缀筛选遗漏新增含费说明，是验收器错误，现直接使用完整配置说明数组；保留原失败，不修改页面文字以迎合断言。

最终 Domain 全包 96 文件／914 测试通过（含 AC11 尚未接入的六例）；Schemas 152 文件／1612 测试通过。Server 构建、Desktop 构建、Mobile 类型、边界与依赖门禁通过。精简发现消息因共享预算说明增加超出原 16000 字节 16 字节，现只精简发现专属重复措辞，保留共享的小数／布尔 AST 示例和全部执行语义；未提高预算阈值。原逐字提示断言同步为相同含义的新措辞，当前四文件 19 测试通过（`/tmp/volatility-entry-current-final.log`）；新实际发现复验正在独立目录运行，结果另记。

正式只读规划 `var/acceptance/backtest-volatility-route-draft-20261115/plan.json`：仅 lmstudio 当前模型的策略发现、编写生成和编写修改三个用途 v4 → v5，保持原生 Schema 和手工策略，最多 3 次、每次最多 8192 输出、总期限 600 秒，预计 USD 0。其他用途和配置保留；规划本身无模型调用或真实 Provider 写入。真实资格改变需用户批准该具体规划，先前 v4 授权不扩大。正式同步后拟在 Server／Worker 各重放 20 份冻结样本，核对 34 模块、完整结果／重复回放／中文及 HTTP 三用途 v5 readiness，模型调用和业务写入为零；此目标阶段尚未执行。

精简后的最后发现批次 `backtest-volatility-discovery-budget-final-20261115` 已通过：1 次私有原生格式探针与 2 次无字段名业务生成，正式装配、原样保存、实际 Worker／重复回放和中文全部通过（`/tmp/volatility-discovery-budget-final.log`，业务阶段约 195 秒）。目标 20 份输入使用这两份替换先前发现复跑的两份，其余输入保持原值。Server 最终构建及类型通过；全仓 guardrails 8 组／4009 文件通过、尺寸无警告，仍仅有原兼容测试长度警告和 React Native parser 提示（`/tmp/volatility-guardrails-final-plan.log`）。正式规划中五条其他用途经深比较完全相同，JSON 键顺序差异不当作路由变化。

最后发现的同一批新配置已在 `backtest-volatility-browser-discovery-budget-final-20261115` 完成 24 张页面及全部断言，替换上方发现组作为当前提示的最终页面证据；编写与修改组保持原值，最终集合仍为 64 张，不重复计数为更多覆盖。

### AC11 等待 v5 授权时的独立准备

`backtest-trade-plan-allocation.ts` 独立准备调仓节奏选择，月末记忆按日历月份去重，不同时间戳重复观察、拒单后当月重看均不重算，次月重新判断；盘中尚未完成收盘不会提前消耗该月判断。新增一例与既有六例共 7 项通过（`/tmp/monthly-allocation-tests.log`）。该模块尚未被主状态机 import，没有改变当前 v5 实际行为。Domain 类型通过。

`backtest-trade-monthly-rebalance.ts` 独立准备严格三字段 Schema 及仓位控制器互斥校验，两例通过（`/tmp/monthly-schema-module-tests.log`）；尚未导入正式根 Schema 或生成合同。`backtest-trade-monthly-display.ts` 准备目标百分比、绝对百分点、真实月末、下一开盘、跳空含费约束与同月不补做说明，也尚未接入双端。`monthly-rebalance.fixture.ts` 仅准备独立模拟输入和不提示字段名的月末／首次投入对照；没有进行月末实际模型调用或执行验收。Server／Domain 类型与 allocation／夹具定向 ESLint 通过。

v5 三用途真实资格升级与同步的具体授权问题已提出，保持待确认；等待时没有改动已提交规划的正式 v5 入口合同或实际执行行为。此时不能勾选 T04b.4 或 T04c。待 v5 目标证据封存后，再接入月末正式入口并按独立合同版本验证，避免把两阶段输入混为同一回执。

### AC10 v5 授权后正式保存

用户明确允许按具体规划升级到 v5 并同步验收。从 infra 正式锁执行 `STRATEGY_ROUTE_UPGRADE_AUTHORIZED=1 node scripts/infra.mjs locked --idle -- node ../thesis-ledger/scripts/local-runtime/run-strategy-trade-plan-route-upgrade.mjs apply <独立目录>`，退出 0；最多三次原生格式探针内通过正式保存，三个用途均为各自 v5，其他路由保持原值。回执 `var/acceptance/backtest-volatility-route-applied-v5-20261115/result.json`，日志 `/tmp/volatility-route-apply-v5.log`。已开始正式 `./scripts/sync-code.sh thesis-ledger`，其结果与目标回放另记，不能仅凭资格保存宣称目标已更新。

随后正式 `./scripts/sync-code.sh thesis-ledger` 退出 0，兼容性预检、workspace／Server 构建及双服务健康检查通过（`/tmp/volatility-sync-v5.log`）。镜像仍为 `sha256:145d6f91a4ef7c3eaac801f26c89ac42fa446ccfb24c54ff67c03d8b87f0e4c2`；只更新容器可写层，没有数据库结构或外部卷变更。目标通过后再修改月末正式入口，不把后续源码混入本回执。

`var/acceptance/backtest-volatility-target-v5-20261115/receipt.json`、`/tmp/volatility-target-v5.log`：正式锁下两个实际容器各执行 20 份独立冻结样本，34 模块哈希、完整结果、重复回放及中文均完全相同，三个 HTTP v5 用途 readiness 全部 ready、原生格式验证 passed。模型调用 0、业务写入 0，不创建真实队列任务，不扩大为编写任务生命周期、目标 Desktop 或原生真机验收。AC10／T04b 至此完成，继续 AC11。

### AC11 正式根合同、状态机与冻结执行

月末严格 Schema 已接入完整／编写／精简生成及保存使用的根合同，三用途新版本为 v6，编写／优化提示为 v19／v6；旧 v5 引用继续可读。当前真实资格和目标仍为 v5，不借 AC10 授权激活月末能力。`BacktestTradePlanAllocation` 统一调仓节奏，主状态机继续负责风险、入场许可、暂停、待成交及真实成交接受；替换原每日专属接缝后旧波动率实际账本三例仍通过，旧大文件净缩小。

`backtest-trade-monthly-execution.test.ts` 通过两例实际账本：月末收盘冻结数量，次月首个开盘先买、上涨后卖、下跌后买；同一输入完整成交记录一致，重复观察经济结果不变。跳空买入只受含费投入上限缩量，不重算放大；首次拒单当月不补做、下月重新检查；未知日历不回退普通 50% 仓位；月末风险清仓先于目标补仓，普通退出也保持优先。初版夹具的计划日历与 `VersionedExecutionRules` 日历不一致，模拟 10 月 1 日被原规则拒为假期；改为同一明确模拟日历，未修改业务门禁。另一个失败是断言错误把先前正常月末减仓当成止损，现构造真正同根风险与补仓冲突。失败 `/tmp/monthly-ledger-execution-tests*.log` 保留；最终 `/tmp/monthly-ledger-execution-tests3.log` 两文件五例通过。

正式 Worker 初次只在六月首次建仓，暴露真实冻结范围缺口：原 Builder 日历从执行／预热起点开始，缺首月前半月；严格整月门禁正确跳过五月。新增 `backtest-trade-plan-calendar-range.ts` 只扩大月末日历请求到首尾完整月份，价格、预热和执行窗口保持原值，结算较大范围仍保留。`/tmp/monthly-worker-calendar-window-tests.log` 两例通过，断言月末日历从 5 月 1 日至 9 月 30 日，原首次投入日历保持旧范围；实际冻结 Runner 两次完整结果相等，冻结后禁止新行情读取，五月建仓、六月减仓、七月补仓、八月轻微偏离跳过均通过。

Domain 全包 98 文件／918 测试通过（`/tmp/monthly-domain-full.log`）；Schemas 首次全包仅另一任务的 Python 分红合同测试超出默认五秒，同例独立约 0.7 秒通过，未改超时。随后限制为两 Worker 的完整包复验 153 文件／1615 测试全部通过（`/tmp/monthly-schemas-full-bounded.log`）。Server 构建及类型通过。发现固定消息原增至 17009 字节；去掉重复可变字段示例、冗余装配版本及与完整 Schema 重复的说明，保留完整严格 Schema、小数和布尔 AST 示例，最终三文件 17 测试通过原 16000 字节门禁（`/tmp/monthly-prompt-final-tests.log`）。实际模型与浏览器仍待独立批次，不把这些固定样本当作 AI 理解通过。

### AC11 实际发现失败与提示收敛

首轮 `backtest-monthly-discovery-v19-20261115` 三次零费率调用中，首次投入样本通过；月末样本虽在说明和理由写出目标 30% 与 3 个百分点，配置未填写月末计划，还擅加 EMA20 上穿入场。原样保存与实际执行得到六月中旬首次买入，分类为 `model_selected_wrong_structure`，不是 Schema 无法表达或引擎偏差。完整请求、输出、配置、中文、冻结快照及结果保留，不解析理由补单。

共享生成说明补充规则必须写入配置、禁止擅加均线条件；编写／优化提示更新 v20／v7，完整 Schema 与小数／布尔 AST 示例保留。仅压缩重复措辞，`/tmp/monthly-budget-v20b.log` 五例继续通过原 16000 字节门禁；不提高阈值。新的独立实际发现批次为 `backtest-monthly-discovery-v20-20261115`，其结果随后记录。中文优先级 helper 和模型验收器控制项白名单重构后，Domain 回读四例及 Server 语义判定三例通过，新增复杂度警告消除。

后续原生发现 v20 仍漏月末计划；v21 错把布尔状态作数值比较，v22 选入 ETF 不允许的 nav 序列，分别被正式装配校验拒绝。完整编写 v20 还漏掉 Schema 3 的来源坐标。各批完整请求、输出或 SDK 错误、已接受配置和结果独立保留，未修补模型结果。共享提示 v21 增加与验收值不同的 40%／2 个百分点结构示例；v22 把完整 Schema 放在发现规则前、编写交易规则放在 Schema 后，未删合同。相应提示提取测试改为读取单行完整 Schema，原先假定 Schema 必须是消息末尾的测试失败保留；修正后门禁通过。

`backtest-monthly-authoring-v22-20261115` 已通过原生资格副本的一次格式探针和两次实际编写生成：首次投入后持有与月末调回目标均通过正式完整合同、Canonical／确认校验、隔离原样保存、冻结 Worker／重复回放和中文。模型调用共 3 次，真实 Provider／历史写入均为 0。当前模块生成的中文与捕获相等，`backtest-monthly-browser-authoring-v22-20261115` 24 张页面覆盖摘要／版本／Mobile 四宽，逐条回读、页签及溢出断言通过；已实际查看月末版本 390 宽截图。

新增只读 HTTP 传输观察只保存实际模型和 `response_format`，不读取请求头、凭证或推理。原生业务请求明确包含月末严格三字段，证据为该批 `wire-2-1.json`、`wire-3-1.json`，不能将模型漏配归因为服务端没发出新 Schema。`backtest-monthly-discovery-json-v22-20261115` 仅在私有资格副本比较 `json_validated`，相同模型／意图／Schema 下，月末样本因额外 null 字段被严格校验拒绝；真实路由未变，也未据此推荐更换模式。

发现专属提示随后明确未用可选字段必须省略、不得填 null，优化提示 v10；编写保持已通过的 v22。成对意图改用无字段名的简洁业务表达，取消“空仓即允许开仓”与“空仓只在月末首次建仓”可能引起的歧义，执行断言不变。`/tmp/monthly-prompt-v23-corrected.log` 两文件六例通过完整 Schema 与原 16000 字节门禁。

Server 三种调仓／暂停实际 Builder／Worker 的最新回归 `/tmp/monthly-worker-regression-final.log` 四文件七例通过。Desktop 构建及六例摘要、Mobile 类型通过。全仓 guardrails 首次在 Server lint 因 Node 堆内存耗尽中断，随后只增加检查进程内存到 8 GiB，`/tmp/monthly-guardrails-v20-memory.log` 八组／4024 文件通过，尺寸无警告；保留原兼容测试长度警告与 React Native parser 提示。未提高业务复杂度阈值，后续提示和观察夹具以定向类型／lint 验证。

### AC12 已确认口径与实际入口盘点

用户已确认首小时 VWAP 使用收盘价乘成交量累计。现有 `backtest-indicators.ts` 的 VWAP 是固定根数窗口，不能直接复用为按交易日重置的会话累计。`BacktestSeriesPoint` 可承载成交量，冻结信号来源会保留量价；独立执行价格投影本身不含成交量，统计应归属信号来源。`barResearchClocksV3` 当前明确拒绝非日线的固定快照研究时钟，因此仅新增 AST 或纯函数仍不能声称 R28 实际入口支持。需进一步贯通盘中完成时点、冻结日历、来源量价单位及模型／回放／中文；本次只读盘点没有放宽时点门禁。

### AC11 最终实际生成、分析和页面

最终原生发现 `backtest-monthly-discovery-v24-20261115` 两份成对意图均通过：普通首次投入后持有省略计划，月末目标配置实际包含 30%／3 个百分点。与 `backtest-monthly-authoring-v22-20261115`、`backtest-monthly-modification-v22-20261115` 组合，共六份配置通过原样保存、冻结 Worker、完整重复回放及配置中文。每批一次私有格式探针和两次业务调用，真实 Provider／历史写入均为零。发现 v23 的擅加保护和后续普通持有冲突失败也保留，没有覆盖旧捕获或修补模型输出。最终发现专属提示采用“纯买入持有省略 tradePlan；未用字段省略”，优化提示 v11，仍通过完整 Schema 与原 16000 字节门禁（`/tmp/monthly-prompt-v24.log`）。

分析 `backtest-monthly-analysis-v22-20261115` 的支持样本通过；不支持的每日固定目标虽正确标记 unsupported，却把 requirementId 填入问题依赖，被正式校验拒绝。只修改分析提示：依赖必须是问题 ID、无依赖用空数组；费用归策略成本；明确能力缺口无需追问改变交易含义。未放宽引用或依赖校验。最终 `backtest-monthly-analysis-v23-20261115` 两份通过：月末六条均 understood、无问题／运行意图；每日固定目标 unsupported、无问题；两份均无订单。编写提示 v23 只影响分析，四份已接受编写／修改请求与当前编译 `authoringMessages` 深比较完全相同，零模型调用复核见 `/tmp/monthly-current-message-equality.log`。对应分析定向三文件 14 例通过（`/tmp/monthly-analysis-prompt-correction-tests.log`）。

共享工作区已有 `strategy-authoring-definition.ts` 的 deadlineMs 由 120000 改为 300000，本任务保留该修改。最新实际调用使用当前正式期限，不宣称通过历史 120 秒限制；此前超时事实保留。目标模块核对包含该合同与实际模型策略，避免只检查计划字段。

最终页面集合为 `backtest-monthly-browser-discovery-v24-20261115` 24 张、`backtest-monthly-browser-authoring-v22-20261115` 24 张、`backtest-monthly-browser-modification-empty-plan-20261115` 16 张，共 64 张；覆盖 1440／1024／768／390、两端摘要、版本及修改预览。先核对捕获中文与当前配置投影相同，再逐条断言实际文字、导航、受控采用／放弃、横向溢出及页面异常。实际查看 390 宽版本与最终 Mobile 修改预览。首次查看发现空壳计划留下空标题，现两端统一显示普通入场／退出／仓位／风险说明，最终重跑通过；此前截图保留，不改历史配置。

最终 Server 构建和类型、Desktop 构建和类型、Mobile 类型、边界与依赖门禁通过。三种计划的 Builder／Worker 回归四文件七例通过；全仓 guardrails 八组／4027 文件通过、尺寸无警告（`/tmp/monthly-guardrails-final.log`），检查进程使用 8 GiB 堆内存，未提高业务阈值。保留原兼容性测试长度警告和 React Native parser 提示；不宣称 Server 全仓测试绿色、真实队列生命周期或原生真机验收。

只读正式规划 `var/acceptance/backtest-monthly-route-draft-20261115/plan.json` 已生成（`/tmp/monthly-route-plan.log`）：仅 lmstudio 的策略发现、编写生成、编写修改 v5 → v6，保留手工策略及原生 Schema，最多三次格式探针、每次最多 8192 输出、总期限 600 秒，预计 USD 0。其他五条用途经深比较相同。规划无真实资格写入或模型调用，真实目标仍为 v5，等待本次具体授权。同步后拟两实际容器各验证 26 份冻结样本、43 模块、完整结果／重复回放／中文及三用途 readiness；此目标阶段尚未执行。

等待 v6 具体授权期间，独立准备 `backtest-session-vwap.ts`：显式完成区间、真实／研究可见性、日历会话、同日完整覆盖、精确量价累计及首小时结果。四例覆盖跨日、午休、60 分钟边界、未来／未完成／不可见、缺量／零量、缺根／重复／交叠、提前收市、日历缺失与美国夏冬时制，`/tmp/session-vwap-standalone-tests.log` 通过；Domain 类型及该模块／测试 ESLint 通过。未导出到正式入口、未改变 v6 合同或目标 43 模块输入，没有进行 AC12 实际模型或目标调用；T04e.2／.3 仍未完成。

AC12 独立准备随后补齐：会话时钟抽为 `backtest-session-clock.ts`，用于分钟数与均价共同消费冻结事实；第五例用相同 31 根模拟行情证明价格 140 高于当日累计、低于最近 20 根 VWAP，未改变既有滚动定义。`backtest-session-expression.ts` 准备严格 `sessionValue` 数值及同源声明校验，两例拒绝日线、基金、未知来源、缺 close／volume 和额外滚动／跨源参数；尚未接入正式 AST。Server `backtest-intraday-bar-session.ts` 三例核对原始开始／聚合结束标签、完整覆盖、截短尾根、真实观察时点、休市、时区与夏冬时制。原始分钟必须有明确 interval-start 和 complete 证明，未知约定不猜测。日志 `/tmp/session-{vwap,schema,intraday}-standalone-{tests,types,lint}.log`，总计十例、各包类型和定向 ESLint 通过。

补充静态盘点：当前 `frozenExchangeSignalSeries` 只把各个字段映射为 value，close 点本身没有 volume；现有指标构建也没有合并同源 volume。因此后续接入须补齐实际量价投影，并在实际冻结 Worker 验证滚动与会话对照，不能把 Domain 的 VWAP 单测当作策略入口已支持。Market V3 完整窗口虽要求每根 complete，但响应没有分钟标签约定字段；正式输入仍需来源证明与冻结保存。上述新模块均保持独立，不改变已经提交审查的 v6 生成消息、真实路由或目标模块。

### 2026-11-16 用户确认沿用 v5

用户明确要求“不升级，直接改v5，另外不要搞那么多版本”。当前三个生成合同和目标检查统一回到既有 v5，移除未发布的 v6 当前引用；后续能力在现有合同补齐，提示标识保持当前值，以输入、内容及模块哈希追踪。原 `backtest-monthly-route-draft-20261115` 仅保留撤回规划和历史捕获，未应用、不进行 v6 Provider 保存。

只读正式规划 `backtest-monthly-route-inplace-v5-20261116/plan.json` 证明全部八条路由深比较完全相同，pending／maxCalls 均为 0；资格指纹只含合同引用等路由事实，不含 Schema 内容哈希。本次不保存或改写任何真实 Provider 配置，不伪造新资格。当前 v5 完整编写／修改原生 JSON Schema 与先前四份实际请求的 `responseFormat.json_schema.schema` 深比较完全相同（JSON Schema draft-7）；业务消息也保持相同，故复用这些真实输入证据，无需为元数据版本再次调用。比较日志 `/tmp/monthly-inplace-v5-wire-equality.log`，发现消息的当前合同标记已改为 v5，因此另做独立实际生成，不覆盖原捕获。

版本收敛后 Schema 定向三文件 15 例、Server 入口／Worker 四文件九例、Schema／Server 构建通过。最新 guardrails 八组／4034 文件通过、尺寸无警告，边界通过，新增独立会话模块也计入本次检查。`ai-execution.ts` 全文件 Prettier 仍报告既有 Arena 导入、推理枚举和推理校验三行格式差异；本次只格式化修改的合同枚举，其他任务原行保持原值，不宣称该文件全格式绿色。源码类型、实际发现及正式同步／目标结果随后记录。

`backtest-monthly-discovery-inplace-v5-20261116`：当前 v5 重新实际调用，一次私有格式探针、两份业务生成共三次，首次投入／月末调仓均 passed，真实 Provider／历史写入均为 0；实际配置原样保存、冻结 Worker／重复回放和中文通过。当前编译编写／修改消息与原四份捕获再次深比较相同（`/tmp/monthly-inplace-v5-message-equality.log`）。新发现页面 `backtest-monthly-browser-discovery-inplace-v5-20261116` 24 张通过四宽、配置回读、页签及溢出检查；实际查看最终 390 宽版本页面。与原编写 24 张、最终空计划修改预览 16 张组成当前 64 张集合，不重复计数旧发现页面。

infra 工作目录正式执行 `rtk proxy ./scripts/sync-code.sh thesis-ledger`，`/tmp/monthly-inplace-v5-sync.log` 退出 0，兼容性预检、构建和双服务健康通过；镜像保持 `sha256:145d6f91a4ef7c3eaac801f26c89ac42fa446ccfb24c54ff67c03d8b87f0e4c2`，无结构或外部卷变更。随后在正式锁内运行维护的 `run-backtest-trade-plan-runtime-check.mjs`，回执 `var/acceptance/backtest-monthly-target-inplace-v5-20261116/receipt.json`、日志 `/tmp/monthly-target-inplace-v5.log`：Server／Worker 各 26 份冻结样本、43 模块哈希、完整结果／重复回放／中文完全相同，三个既有 v5 用途 readiness 全为 ready、原生格式资格仍为原已通过记录。两端模型调用／数据库业务写入均为 0，无 Provider 保存、不创建真实队列。AC11／T04c 完成，继续 AC12；该回执只证明此时封存输入，不自动认证后续会话接入。

### 2026-11-16 AC12 正式入口与首轮模型证据

沿用 v5／提示 v23 与 v11。会话节点已接正式根合同、发现／编写／修改原生 Schema、准备路由、冻结、研究时钟、来源序列、累计及 Worker。原始分钟明确开始或结束标签，较大周期本地聚合；当前累计仅直接比较及布尔组合，滚动嵌套和跨日交叉明确拒绝。只用完成且可见的同源收盘价乘成交量，日历、量价单位、缺口、零量、迟到与跨日状态分别核对。严格后续开盘保留：第 31 分钟在 10:01 完成后判断，同刻开盘已发生，独立累计样本在 10:02 买入；滚动 20 根对照不成交。

`/tmp/session-worker-preparation-regression.log` 四文件 36 例通过，含完整交易日冻结 Worker／完整结果重复回放、原有准备与日线基准。样本无平仓且权益不变，结果为 partial，夏普／平仓统计按既有 ZERO_VOLATILITY／NO_CLOSED_TRADES 显示不可用；基准兼容且收益可用，不伪造完整绩效。`/tmp/session-input-boundaries-green.log` 三文件六例通过，含正式准备所选 MINUTE_BAR／原始 1m／observed-bars-only，路由未配置时不读取；Domain 累计、求值、单位三文件 17 例通过。包级 `/tmp/session-domain-package.log` 101 文件／929 例、`/tmp/session-schemas-package.log` 156 文件／1639 例通过。

当前源码拆出表达式校验、盘中区间、冻结来源序列、会话序列与基准收盘职责，缩减原大文件；追加冻结会话不能读取当前状态或内置年度日历的边界门禁。尺寸无警告，边界通过。全量 guardrails 默认 Node 堆连续两次不足，原 OOM 日志保留；仅将本次检查进程堆设为 8192 MB 后八组／4052 文件通过，未修改规则阈值。随后对本次新增的嵌套三元及复杂度警告做职责收敛，存量其他任务警告保留，最终检查另记。Server／Desktop／Mobile 类型与构建和桌面版本回读定向检查分别留在 `/tmp/session-*.log`，不将 Web 宿主当真机。

首个 `backtest-session-discovery-20261116` 批次遗漏场景环境变量，实际运行四份旧日线意图，不能计为会话证据：两份合法结构语义误选，两份附加绝对价退出而被执行单位门禁拒绝；目录原样保留。正确场景 `backtest-session-discovery-paired-20261116` 实际三次调用（私有格式探针一次、业务两次）：滚动样本通过原样保存、冻结 Worker／完整回放及中文，累计样本虽选对会话节点，却把恒假普通退出写成价格 eq 0，单位门禁拒绝。Schema 能表达恒假退出，这是模型的合法结构误选，不能归为累计引擎偏离。已保留配置、中文与原始错误；系统提示增加两个常量的明确示例，仍保留完整严格 Schema 和 16000 字节门槛，`/tmp/session-prompt-budget-constant-example.log` 五例通过，不提高实际编写期限。

只读核查 DSA：`api/thesis_ledger.py` 当前 V3 窗口仅接受日线 assume-untradable-no-bar；标准分钟能力尚无此窗口所需的历史完整分页／逐日证明投影，既有分钟返回的标签也未接到该 V3 响应。真实来源尚未取得本次资格；未修改同级源码、未新增来源调用、未启用路由。独立模拟数据证明执行链路，不能证明真实来源可用于该回测。实际模型三入口、最终页面与新目标容器验收仍在进行。

### 2026-11-16 AC13／AC14 配置、执行与固定样本

用户确认的逐期 ATR 与条件永久启用合同已接策略根、三个现有 v5 生成合同、来源依赖、预热、坐标／量纲、冻结 Worker 和中文。ATR 直接读取分别调整坐标后的同根 high／low／close，合并可见性；缺字段拒绝，缺观测不可用，不再用收盘变动代替真实波幅。决策时间对齐额外保留指标原始周期，上一期可见 ATR 不能用于本期重算。新增依赖方向门禁；不修改历史结果或真实用途路由。

条件附于具体保护，使用普通布尔 AST；本期首轮限同标的、同主周期。持仓后收盘首次成立便锁存，条件转假／不可用、加仓、部分卖出或拒单不解除，实际全平才重置。启用初始止损仍锚定首次成交价／委托冻结 ATR；条件与盈利门槛同时满足。待成交动作也继续记录峰值与启用状态，不重复下单。拆股同比例转换记忆，风险预算拒绝有条件初始保护。

固定对照目录 `var/acceptance/backtest-protection-fixed-20261116/` 明确标记 `evidenceKind=fixed_fixture`、零模型调用。冻结 ATR 与逐期 ATR 分别于 5 月 28 日／26 日实际卖出，无条件 5% 与 RSI(2) 上穿 60 后永久启用 5% 分别于 5 月 21 日／26 日卖出；均为收盘信号后下一可交易开盘，成交价包含滑点。四份完整 Worker 结果重复相同、离线回放相同，冻结后外部行情读取禁用。`/tmp/protection-fixed-export.log` 四例通过，`/tmp/protection-atr-regression2.log` 的旧引擎身份断言已改为核对实际 Runner，执行结果没有因此调整。

最后包级 `/tmp/protection-domain-final.log` 104 文件／945 例、`/tmp/protection-schema-final.log` 157 文件／1643 例；`/tmp/protection-server-final.log` 五文件／11 例通过。`/tmp/protection-ai-regression.log` 五文件／24 例验证完整 Schema、文本投影、最终校验及适配器。Schemas、Domain、Server 构建、Desktop 构建及 Mobile 类型检查分别通过；不代表原生设备验收。独立策略编辑器 WIP 曾导致 Domain 类型错误，后续已有类型标注修正，本任务未覆盖其实现；全局 lint 的来源 id 对象隐式字符串化仅收敛为保留非空字符串选项，不改写草稿值。其他修改完整保留。最终全仓门禁和目标运行态另记。

固定页面 `backtest-protection-fixed-browser-20261116` 48 张，加 `backtest-protection-fixed-proposal-browser-20261116` 16 张，覆盖双端、版本详情及修改前后，1440／1024／768／390。逐条核对配置生成的文本、只读受控请求、页面异常、溢出及修改范围／放弃交互；已查看条件保护窄屏版本、宽屏修改和逐期 ATR 窄屏图。版本详情的来源中文标签原已显示，验收脚本同步使用对应标签，不再用省略来源的期望文本。页面明确显示首次有效 ATR 前没有该追踪保护、条件成立前没有该条保护，以及锁存／平仓重置。

### 2026-11-16 新保护真实模型失败与投影检查

以下目录均保留原始请求、原生 Schema、生成配置或错误原因，不把人工固定配置计为模型成功：`backtest-atr-discovery-20261116`、`backtest-atr-discovery-final-20261116`、`backtest-atr-authoring-20261116`、`backtest-condition-modification-20261116`、`backtest-atr-authoring-projection-20261116`。每批使用私有隔离资格探针和两份无字段名业务意图，真实 Provider 保存次数、历史写入均为零。

已见失败包括遗漏 high／low 声明、反向入场、额外退出／保护条件、在 coverage 声称保护但实际不生成，以及添加互斥仓位控制。均由正式根、覆盖、量纲或执行门禁阻止，没有补字段或降低校验。单纯 `generation_failed` 中含原生 Schema 校验失败，具体区分见 `response-*.json` 的原始输出和原因，不能统一解释为网络错误。逐期 ATR／条件保护有固定样本可表达并执行，因此这些失败不能记为 Schema 无法表达。

仅三个策略原生用途增加单引用 `allOf` 等价简化，其他用途保留原 Zod 投影，最终仍由原始 Zod 校验；原合同与资格版本不变。`/tmp/protection-native-projection.log` 与 `/tmp/protection-ai-regression.log` 验证约束保留。简化后首份模型已生成初始 ATR 保护，但仍遗漏高低价声明，尚不能认定模型验收通过，也不能据此确认 Provider 是此前失败的根因。公共提示进一步明确对应来源须声明三个字段，`/tmp/protection-budget-ohlc.log` 五例通过，未提高消息门槛或生产期限。后续实际生成、页面和部署回执继续补充。

AC12 追加失败捕获：`backtest-session-modification-20261116` 为输出空闲超时／连接超时；`backtest-session-authoring-final-20261116` 仅私有探针连接失败、未进入业务调用；`backtest-session-discovery-final-20261116` 滚动超时，累计配置错误选择“已持仓”及“不低于第31分钟”，中文按原配置显示、零成交。已有发现滚动和编写累计成功分别保留，不能扩展为三个入口全部通过。真实分钟来源合同缺口仍存在。

### 2026-11-16 操作合同与本期保护时点补充

正式编写消息、预算前校验和实际适配器现在使用同一操作 Schema：生成冻结用户确认事实，局部修改冻结范围外基线，保护与普通规则仍由模型输出。原生与文本投影共用固定元组约束，保留长度、逐项值与禁止额外项；其他用途沿用原调用路径。新生成策略直接要求布尔入场／退出与价格坐标，历史二版修改继续兼容。资格仍为三个 v5，未保存真实 Provider。

`/tmp/protection-domain-exact-close.log` 104 文件／946 例通过，增加缺本期收盘时不启用／触发保护的验证；`/tmp/protection-final-exact-worker.log` 会话与保护两文件六例通过。`/tmp/protection-coordinate-schema-package.log` 158 文件／1651 例通过；`/tmp/protection-operation-final-tests.log` 五文件／18 例通过，覆盖正式编写尝试、文本合同、原生投影与探针。`/tmp/protection-operation-final-server-build.log` 构建、`/tmp/protection-operation-final-types.log` 类型、`/tmp/protection-operation-lint-final.log` 定向检查及 `/tmp/protection-boundaries-operation.log` 边界通过；后续输入变动另行留证。

`backtest-atr-authoring-operation-20261116` 的旧探针实例仍为二版，在发送前被新的三版生成合同拒绝，零外部调用；已修正实例。`backtest-atr-authoring-operation-final-20261116` 有一次真实探针调用，返回三版但遗漏来源价格坐标，被最终合同拒绝，未进入业务调用。两份失败原样保留；已将三版来源坐标必填直接表达进生成 Schema，随后批次另记。不得把探针失败归为 ATR 语义生成失败。

其他实际捕获：`backtest-atr-authoring-ohlc-20261116` 冻结 ATR 通过，逐期样本漏计划；`backtest-atr-authoring-shape-20261116` 逐期样本添加风险预算、漏追踪且普通退出为数值树，被拒绝。`backtest-condition-authoring-final-20261116` 两份增加未确认的独立止损，由确认门禁拒绝；`backtest-condition-discovery-projection-20261116` 两份结构合法但改变入场／普通退出／独立风险，已保存冻结执行并按实际配置生成中文，属于模型误选。对应实际页面分别为冻结 ATR 12 张、条件误选对照 24 张四宽截图；页面通过不能计为模型意图通过。

### 2026-11-16 三版输入、等价保护与新增实际配置

`backtest-atr-authoring-coordinate-20261116` 三次真实调用：冻结样本漏实际计划而在 coverage 声称存在，被拒绝；逐期样本完整，但研究来源与旧模拟夹具的前复权执行口径不一致。`backtest-condition-modification-operation-20261116` 三次真实调用：无条件样本擅加互斥仓位控制而被拒绝；条件样本完整，也遇到同一夹具口径问题。这是验收输入缺口，不是引擎偏离。

三版模拟输入已改用正式双价格准备流程，显式冻结研究／实际来源，模拟价格比例为一；不改模型定义，不认证真实来源。`/tmp/protection-coordinate-refactor-tests.log` 四文件／12 例通过，含三版研究与实际来源、原四份保护及会话输入回归。`backtest-condition-modification-replay-20261116` 仅重放实际捕获的 armed-stop，零调用，原配置隔离保存、完整 Worker／重复回放及中文通过。页面 `backtest-condition-actual-armed-browser-20261116` 八张修改前后，`backtest-condition-actual-armed-details-20261116` 十二张详情，均覆盖四宽；已查看 390 像素版本详情。未声称成对或三个入口全部通过。

逐期配置还显式写了 `activateWhen=isOpen`。首份零调用回执 `backtest-atr-authoring-coordinate-replay-20261116` 将其严格判为结构误选；后经代码复核，逐期 ATR 两种写法都在持仓后首个有效收盘开始建线。`/tmp/protection-held-equivalence-domain.log` 的正常、迟到及旧期 ATR 成对轨迹、保护线、信号与诊断一致；后续包级 `/tmp/protection-domain-held-final-package.log` 104 文件／949 例通过。只接受这项已证明等价的谓词，额外等待条件仍拒绝，`/tmp/protection-held-conformance-final.log` 三例通过。新回执 `backtest-atr-authoring-equivalent-replay-20261116` 零调用通过，原配置与最初模型输出一致；旧回执保留，并以此段更正分类。

`backtest-atr-modification-operation-20261116` 的冻结样本以 length 结束，逐期样本原生 Schema 不匹配；`backtest-condition-authoring-object-20261116` 两份仍在 coverage 引用未输出的计划。均保留，未延长生产期限、提高输出上限或补写模型配置。编写提示补完整计划对象示例，公共提示明确省略未要求的启用条件；`/tmp/protection-stable-prompt-tests.log` 五文件／19 例通过，保持 16,000 字节门禁和现有提示标识。

最终作用范围内 TypeScript lint 无错误，三个宿主脚本按现有忽略规则未参与 ESLint，运行态脚本另经 `node --check`；边界、尺寸及定向复杂度通过。本次将分钟完整区间、表达式所需价格字段和验收语义判断分别收敛为独立职责，未提高阈值。全仓 `/tmp/protection-operation-guardrails.log` 在其他任务的创建／发布断言和优化测试未用变量处有三项错误，不能记为全仓通过；React Native 的 Flow 依赖还产生解析警告。

第一次正式同步 `/tmp/protection-v5-sync.log` 在宿主 Server 构建时被并行编辑器测试的五项类型错误拦住，尚未传输或重启。仅为已通过根校验的测试定义补充 `BacktestStrategy` 类型，保留其业务与全部其他修改；后续独立类型补全及构建另行通过，第二次同步与目标回执继续记录。

### 2026-11-16 正式同步、双容器与分钟语义反例

第二次正式同步 `/tmp/protection-v5-sync-final.log` 退出 0，Server／Worker 健康；仍为镜像 `sha256:145d6f91a4ef7c3eaac801f26c89ac42fa446ccfb24c54ff67c03d8b87f0e4c2` 的可写层更新，不代表镜像发布。三个策略合同仍为 v5，未保存 Provider、未改结构或依赖。

目标回执分别保存在 `backtest-protection-target-baseline-20261116`（每容器原有 26 份）、`backtest-protection-target-fixed-20261116`（每容器四份固定新保护）、`backtest-protection-target-four-actual-20261116`（每容器四份实际配置：滚动均价、冻结 ATR、逐期 ATR、条件止损）。均位于 `var/acceptance/`，均核对 99 个编译模块、完整结果、重复回放、当前中文投影和三个 v5 readiness；业务写入及模型调用为零。冻结 ATR 先在 `backtest-atr-frozen-coordinate-replay-20261116` 用原始输出零调用重新准备三版研究坐标，未改模型配置。

中间失败回执保留：旧历史中文缺少新增来源标签、旧三版模拟快照仍为前复权执行口径，分别造成目标检查失败。验收脚本现在同时保存历史回读与当前回读，严格比较宿主当前投影和目标投影，不改历史捕获，也不放松执行结果断言。单例诊断及失败目录继续保留。运行态检查和模型检查共用维护锁，一次模型启动被已有锁直接拒绝，未创建捕获、未调用模型；待运行态退出后才重试。

AC12 旧编写累计样本的“通过”结论需要收窄：原文“第31分钟的行情已收盘”有时间范围歧义，旧矩阵又遗漏第 32／60 分钟，因此不能证明只在恰好第 31 分钟买入。新增这两个反例，并要求普通退出在已持仓时也不触发；`session-vwap-model-conformance.test.ts` 三例通过，能拒绝 `gte 31` 和错误的已持仓退出。新自然语言明确“其他分钟即使满足条件也不买”，须重新实际生成；不会把旧模型输出套上新意图计成功。旧输入、配置、当时判定和忠实执行结果保留。

会话浏览器当前回读分别输出到 `backtest-session-rolling-readback-browser-20261116` 和 `backtest-session-cumulative-faithful-browser-20261116`，各十二张四宽截图。后者只证明中文忠实显示旧累计配置，不代表新的恰好分钟意图通过。逐期 ATR 实际配置另有 `backtest-atr-actual-current-browser-20261116` 十二张；已查看 390 像素版本详情，触发与后续开盘、ATR 缺失保留保护、首次有效 ATR 前没有该保护及条件锁存均直接可见。

`backtest-session-exact-minute-authoring-20261116` 使用明确的新自然语言、正式编写操作 Schema 和同一 lmstudio，三次真实调用（私有探针一次、业务两次）。滚动与累计两份原始配置均为恰好第 31 分钟，普通退出恒假；语义矩阵、隔离保存、冻结 Worker、重复回放及中文通过。固定行情下滚动零成交、累计在 10:01 收盘判断后于严格后续的 10:02 开盘买入。没有把旧生成重放为新生成。新四宽页面分别为 `backtest-session-exact-rolling-browser-20261116`／`backtest-session-exact-cumulative-browser-20261116`，各十二张。

补充冻结订单反例：`session-minute-counterexample.test.ts` 仅把独立行情的第 31 分钟改为 90（不满足均价），第 32 分钟仍为 140（满足）。`eq 31` 零成交，`gte 31` 于 10:02 收盘发信号、10:03 开盘买入；两种配置各自完整 Worker 重复结果相同。`/tmp/session-minute-counterexample-worker.log` 两例通过；`/tmp/session-semantic-counterexamples-final.log` 三例及定向 lint／格式通过。该反例不修改真实来源、历史决策或已封存快照。

`backtest-session-exact-minute-discovery-20261116` 三次真实调用的结果不能算当前入口成功：旧验收夹具仍用二版固定种子，正式保存门禁已要求三版显式价格坐标，滚动配置在保存被拒；同时该配置把分钟写成 30，另有独立语义误选。累计生成原生 Schema 不匹配。保留完整输入和错误，不把夹具拒绝归为执行引擎偏离。

发现验收现直接调用正式 `createDiscoverySeed`，将 `seed.json` 与请求一起冻结；零调用回放优先读原种子，没有该文件的历史捕获沿用旧夹具。未修改生产种子或模型输出。`/tmp/protection-discovery-seed-tests.log` 正式发现十一例、定向 lint 与格式通过。类型检查首次缺少宽类型标注，第二次的已校验根仍保留 `unknown` 表达式类型，日志分别保留；为通过正式根校验的种子标注领域类型后复验，结果另记。此前在检查进程未退出时提前报告通过，以本段更正。使用正式种子的新真实生成另存 `backtest-session-formal-seed-discovery-20261116`，不覆盖旧失败。

该正式种子批次的累计／滚动两份均通过，三次真实调用；装配固定项来自记录的三版种子，模型选择当日累计／滚动 20 根、恰好第 31 分钟、空仓、25% 和恒假普通退出。原配置隔离保存、冻结 Worker／重复回放及中文通过，独立行情仍为累计一笔／滚动零笔。相应页面 `backtest-session-formal-rolling-browser-20261116`／`backtest-session-formal-cumulative-browser-20261116` 各十二张四宽截图。

新模拟修改基线显式使用三版研究坐标，调用现有 `projectPriceResearchStrategy`；只处理新建独立夹具，历史捕获沿用原始 `beforeConfiguration` 和消息。未自动升级真实策略。`/tmp/protection-model-harness-types-final.log` 已等待进程退出 0，定向 lint、两份夹具格式通过。会话修改的真实批次另存 `backtest-session-exact-minute-modification-20261116`，结果另记。

会话修改该批次三次实际调用、两份配置均通过：只切换累计／滚动均价，恰好分钟、入场其他条件、普通退出、资金和费用等保持；原配置隔离保存、冻结执行及完整重复回放通过。与上述发现、编写合计六份当前实际配置，三个入口各自经过实际调用。修改页面 `backtest-session-modification-rolling-browser-20261116`／`backtest-session-modification-cumulative-browser-20261116` 各八张，连同发现／编写四组十二张形成最终 64 张四宽页面。

为避免以后更新样本措辞而误标旧回放，发现重放现在保留捕获的原始 `intent`；编写捕获增加完整 `inputOperation`，后续重放优先复用原操作输入，旧捕获的原始意图也保留。未补写历史文件；缺完整操作的旧捕获不宣称完整请求重建。`/tmp/protection-capture-input-types.log` 等待退出 0，定向 lint 通过；仅验收夹具调整，生产模块输入未变。

会话修改的语义结论再次收窄：原固定基线漏了“空仓”谓词，旧矩阵又只检查空仓入场；修改模型按基线保留该遗漏。因此该批次的执行／修改范围检查通过，不能证明完整自然语言配置语义。发现和编写的新四份本身包含空仓谓词，不受此遗漏影响。现固定基线明确加入空仓，并增加已持仓入场必须为假的反例；`/tmp/session-held-entry-counterexamples.log` 两文件六例通过，含前述严格后续开盘反例，定向 lint 和格式通过。旧修改原文、基线、输出及当时判定保留，修正后的基线须另行实际生成，不归咎于模型自行删除限制。

`backtest-session-target-six-actual-20261116/receipt.json` 两容器各六份完整结果／重复回放／中文、99 模块及三个 v5 readiness 全部通过，业务写入和模型调用为零。此回执证明所有配置忠实执行；其中发现和编写四份满足当前意图检查，旧修改两份仍受上段基线遗漏限制。不能仅凭运行态回执将其提升为完整意图通过。补齐基线后的修改另存 `backtest-session-held-entry-modification-20261116`。

补齐基线后的修改三次真实调用、两份原配置均通过当前矩阵，包括已持仓入场为假、普通退出为假以及第 32／60 分钟不买；仅 `entry` 差异，源坐标和其余配置保持。隔离保存、冻结 Worker／重复回放及中文通过，完整操作输入随捕获保存。最终修改页面改用 `backtest-session-held-rolling-browser-20261116`／`backtest-session-held-cumulative-browser-20261116` 各八张；连同现有发现、编写四组十二张为本轮最终 64 张。旧漏空仓批次和页面继续保留，不计入本轮完整意图成功。

`backtest-session-input-operation-replay-20261116` 仅零调用重放新滚动修改样本，实际执行完整操作捕获分支；操作、意图、消息、配置和完整结果与原捕获逐项深比较均相同。`/tmp/session-input-operation-replay.log` 通过，未用当前自然语言替换原始输入。

`backtest-session-target-held-modification-20261116/receipt.json` 两容器各两份新修改配置、99 模块、完整结果／重复回放／中文和三个 v5 readiness 全通过，零模型调用、零业务写入。连同上一会话回执中的发现／编写四份，覆盖当前三个入口六份实际配置。未重跑输入未变的原 26 份基线。最终已查看补齐空仓后 390 像素累计修改预览，原／新规则、原资金和退出约束直接可见，窄屏无横向溢出；其余宽度和双端由脚本逐条核对。T04e.3 可勾选，真实分钟来源证明仍不勾选。

### 2026-11-16 正式发现的固定成本与保护验收

`backtest-atr-formal-seed-discovery-20261116` 三次真实调用：冻结配置能原样保存、冻结执行和回读，但普通入场与普通退出均为恒真；逐期配置遗漏 ATR 所需 high／low 并添加额外 ATR 启用条件，正式装配拒绝。原始输出和错误保留。另有验收输入范围冲突：正式 `createDiscoverySeed` 固定策略成本为零，精简发现合同不允许模型更改成本，而该批意图沿用了编写入口的非零费用。因此费用差异不能算模型误选，也不据此修改生产种子。

新保护发现意图现直接使用记录的种子成本，另存 `confirmedCost`；成对保护含义不变。编写／修改继续使用自己的确认成本；旧捕获未记录该事实时仍沿用原检查，不用新费用标准重标成功。`/tmp/model-cost-session-conformance-final.log` 两文件八例通过，新增固定成本冲突与漏保护仍须拒绝的检查；类型、定向 lint 结果另以已退出进程为准。对应公平输入的条件发现另存 `backtest-condition-fixed-cost-discovery-20261116`。

固定成本条件发现三次真实调用：无条件样本正确，但因单项 `all` 包装被原验收器判错；条件样本确实把 RSI 上穿放到入场，未放到保护启用，还将普通退出设为已持仓。后者原样保存、冻结和回读，5 月 22 日买入、25 日普通退出，属于合法结构误选，不是保护引擎偏离。前者仅规范化单项 `all`／`any` 布尔恒等包装，不改模型配置；`/tmp/protection-boolean-wrapper-final.log` 五例通过，仍拒绝恒真普通退出，`/tmp/protection-boolean-wrapper-types-final.log` 已退出 0。此前缺测试类型收窄的日志保留；固定成本版类型、lint 与格式也分别退出 0。无条件原始误判回执保留，零调用更正另存。

上段“无条件样本正确”的判断不完整，以本段更正：完整配置还包含 `risk.fixedStop=0.05`，叠加于已有计划初始止损，违反本样本“不加其他规则”的约束。布尔包装本身等价，但并非该配置的唯一差异。`backtest-condition-unconditional-equivalent-replay-20261116` 零调用仍拒绝，原配置没有删改，也不提升为成功。两份固定成本条件发现均未通过完整意图；生成、合法配置执行和展示仍分别保留为证据。

固定成本的成交价预期也同步读取同一份滑点，编写默认成本不变；定向五例和类型检查退出 0，未放松保护、时间或数量检查。`backtest-atr-fixed-cost-discovery-20261116` 三次真实调用：冻结样本消耗 16,384 输出 token，以 `length` 结束且未产生 JSON；逐期样本虚构 Indicator 参数 `atrPeriod`／`atrMultiple`，被正式根合同拒绝。两份未进入成功保存／执行，不归类为引擎偏离；也没有提高输出上限、延长生产期限、修改真实路由或从残缺输出补单。固定成本输入冲突已消除，剩余是模型生成失败。最新完整对象提示晚于此前修改捕获，ATR 双向修改另以 `backtest-atr-modification-object-20261116` 核对。

合法但误选的条件发现配置，其中文页面为 `backtest-condition-fixed-cost-discovery-browser-20261116` 二十四张四宽截图；无条件侧叠加风险、条件侧将 RSI 用于入场与普通清仓均按原配置展示。页面通过只证明忠实投影，不算意图通过。

已查看该条件误选的 390 像素版本详情：入场行显示 RSI 上穿、退出行显示已持仓、计划显示无条件初始 5% 止损，没有把摘要中想要的“条件成立后启用”补入中文。当前配置与意图不符这一事实可从页面直接判断；真实历史策略保持只读。

### 2026-11-16 最新修改入口与剩余验收边界

`backtest-atr-modification-object-20261116` 使用晚于此前失败捕获的完整对象提示，三次真实调用（私有格式探针一次、冻结／逐期业务各一次）。两份业务输出均为 JSON，但擅加风险预算、每日波动率及月末调仓，分别违反初始止损要求与组合互斥，由正式合同拒绝；没有产生成功保存的策略，不属于引擎执行偏离。原始请求、输出、已确认基线与校验原因完整保留；日志 `/tmp/atr-modification-object.log` 退出 1。未通过补写、删除额外配置或修改费用将其变为成功。

无条件止损修改另以 `backtest-condition-modification-object-20261116` 核对同一最新提示。首次宿主命令缺少已登记的空闲 builder 检查，被正式入口拒绝，日志 `/tmp/condition-modification-object.log`；未创建捕获或调用模型。随后通过 `locked --idle` 正式重启，日志 `/tmp/condition-modification-object-idle.log`，最终结果单独记录。

该批两次真实调用（私有探针一次、业务一次），业务输出擅加风险预算但未配置其所需初始止损距离，由正式根合同拒绝；退出 1，未成功保存或执行。该失败与 ATR 修改的两份失败均保留，不从 Schema 拒绝推断执行引擎错误。没有重复相同输入继续抽取成功结果，没有扩增版本、路由资格、输出预算或调用期限。

本轮仍在共享 `main`，工作区含 603 个其他任务与本任务的修改路径；未暂存、提交、回退或清理。最新生产同步后只修改验收夹具、脚本及文档，未改变编译模块输入，因此复用既有 99 模块目标证据，不重复同步或基线构建。固定样本、实际生成、目标执行和真实分钟来源资格继续分开记账。

收尾重新核对五份目标回执：原 26 份基线、固定新保护四份、实际配置四份、会话旧六份及补齐基线后会话修改两份；每份的 99 个编译模块哈希均与当前宿主产物相同。该检查只证明证据输入未变，不增加真实模型成功数量，也不将宿主哈希核对当作新的容器执行。剩余未通过项为新保护的三个入口成对模型覆盖、真实分钟来源资格，以及等待范围选择的 T04d 委托撮合。

文档本地链接检查无缺失。`/tmp/protection-docs-final-format.log` 中 Task 格式通过，证据文档仍有既有表格列宽格式警告；按行过滤全部表格后，现有文本与 Prettier 结果完全相同，未为本次追加重排历史表格。此警告不记为格式全通过。

### 2026-11-16 新保护额外规则的来源与生成合同修正

本轮继续沿用三个 v5 和提示 v23／v11。重新核对 `backtest-atr-modification-object-20261116` 两份原始失败值：模型已输出风险预算、亏损暂停、月末调仓和每日波动率，反而缺少 coverage 声称覆盖的初始／追踪保护。无条件修改的原始值也已含风险预算。额外项在适配器最终校验前的响应中存在，不是保存、执行或摘要解析补入。

旧原生计划 Schema 只必填 `version`、`evaluation`、`stages`；其余字段均可选，不能声称后端 Schema 强迫模型填写全部能力。可直接确认的输入缺口有两项：发现提示说“未要求的 risk 省略”，但该合同必填 `risk` 数组；风险预算所需的无条件初始保护、各仓位控制互斥仅由 Zod refinement 表达，没有进入原生 JSON Schema。统一提示连续列举所有控制，且没有明确区分投入权益比例与损失风险比例，这是模型擅加规则的待验解释，不是对模型内部推理的已证实归因。旧提示、Schema 与失败回执保持原值。

三个实际生成合同现在共用严格计划分支，直接表达普通保护／阶段、风险预算、月末与每日波动率的已有组合限制，保留原根校验。保护字段说明区分冻结／逐期 ATR，公共提示明确字典不是全填模板、投入比例只属普通仓位、保护条件不可挪到入场／普通退出；发现无独立风控时明确输出空数组。服务端没有按自然语言选择分支、补保护或删除额外字段。

组合检查枚举五种初始保护、四种追踪、四种阶段及八种仓位控制组合，共 640 份候选；新旧合同的接受结果及合法输出逐项一致。Schema 定向两文件七例、全包 159 文件／1653 例、类型与构建通过，日志 `/tmp/protection-rule-origin-schema-{tests,package,types,build}.log`。首次 Server 定向检查发现消息增至 19,179 字节，触发原 16,000 门槛，失败留在 `/tmp/protection-rule-origin-server-tests.log`，没有在失败后调用模型。

随后共用本地引用压缩及精简重复能力说明，保留完整字段、递归与组合断言：Schema 文本从 13,002 字节降为 11,099 字节；常量或枚举已经蕴含的类型不重复书写，矛盾类型仍保留，常量／默认值／示例内部不改写。三份专项测试覆盖这些边界。`/tmp/protection-rule-origin-compact-tests.log` 八文件／30 例通过，包含真实发现消息的原门槛和三个合同的原生最终校验；首次 lint 发现未使用解构变量，单独修正，最终结果另记。原始失败不覆盖，不提高预算或修改 Provider。

`backtest-protection-origin-atr-modification-20261116` 三次真实调用的原生格式通过，但两份业务均未通过：冻结样本漏计划而 coverage 指向不存在的字段；逐期样本原样保留旧冻结 ATR，实际没有修改。两份都未再添加风险预算、亏损暂停或调仓；仅能说明本批未发生额外控制，不能声称模型稳定或把改善唯一归因于某一改动。原样中文也分别显示没有计划、仍为冻结 ATR，未替模型补意图。

进一步核对修改实际消息，确认还有相互冲突的指令：系统要求保留全部旧需求及确认退出含义，用户输入同时保留旧确认与新的相反替换意图。末尾的当前意图优先句不能消除前文冲突。修改提示现明确把旧描述／需求／确认为历史来源，在所选范围内以本次意图替换，范围外仍冻结原定义，coverage 使用原标识但指向修改后的实际字段；生成提示继续保留原确认要求。没有修改输入、旧确认或最终语义／范围校验。`/tmp/protection-origin-scope-tests.log` 五文件／18 例通过，覆盖提示来源、完整输入原值和原范围校验；新真实批次另存 `backtest-protection-scope-atr-modification-20261116`。

该批三次调用中，冻结 ATR 原样保存、冻结 Worker／完整重复回放及中文通过，未带其他控制；逐期 ATR 仍照抄旧冻结保护，因没有实际修改被拒。仅改系统说明不足以保证模型正确替换，不把单份成功扩大为成对通过。旧保护自然语言在描述、需求 quote、interpretation 和确认摘要中反复出现，而当前意图只出现一次，这是可直接观察到的消息重复与约束优先级问题。

修改消息随后只投影本次 intent、modificationTarget、结构化 baseline 和 requirementIds；完整原操作仍随实际捕获保留，未改历史来源或数据。最终覆盖和范围校验不变，生成消息保留原确认。`/tmp/protection-origin-structured-scope-tests.log` 五文件／18 例通过；实际新批次 `backtest-protection-structured-atr-modification-20261116` 使用同样成对意图和配置基线，独立记录结果。

结构化基线批次三次真实调用仍未通过：冻结样本将普通投入的 20% 另配为风险预算，并遗漏冷却；逐期样本没有计划，却在 coverage 声称覆盖。两份均被正式覆盖校验拒绝，未保存成功策略或执行，不改写失败值。该结果说明前述 Schema 组合约束和历史文本去重不足以解决语义选择。

另核实已安装 AI SDK `7.0.107` 的类型合同，`instructions` 为正式选项，`system` 才是弃用别名；既有受控 HTTP 测试还逐字核对单次／流式系统消息。因此排除“适配器移除系统消息后没有发送”的猜测，没有修改适配器。新实际捕获增加消息角色、内容字节数与 SHA-256，不保存请求头、凭证或推理。修改用户消息现在先放结构化基线，最后放当前意图；系统只给当前修改范围的规则，明确逐项重建计划及检查遗漏，不再向计划修改混入独立风险修改指令。定向四文件／17 例通过（`/tmp/protection-final-intent-tests.log`），新实际批次为 `backtest-protection-final-intent-atr-modification-20261116`。消息位置影响仍属待验证假设，不从一次成功断言模型内部原因。

最后意图批次三次调用：冻结样本依旧额外配置风险预算，逐期样本保留旧冻结保护而没有实际修改。实际出站两个业务消息的角色、字节数和内容哈希均与入口消息一致。冻结样本是合法但误选，已原样隔离保存、执行及完整回放；中文显示风险预算替代普通仓位、权益投入上限 100%，实际也按该额外控制买入，而不是按意图的普通 20% 投入。不得把它归为执行偏离。逐期样本由正式“没有实际变化”校验拒绝，未保存成功策略。

`backtest-protection-text-diagnostic-atr-modification-20261116` 只在私有资格副本将输出模式改为 `json_validated`，模型、消息和合同不变，真实 Provider／路由零写入。三次调用中两份业务均违反冻结字符串版本 `"3"`，由根校验拒绝。该对照没有证明原生模式是语义误选的原因，也没有提供切换真实路由的依据。此批拒绝发生在最终解析后，原捕获只保留错误链而未保留最终 JSON，不能臆断实际错误值；该证据缺口如实保留，不补写或重标。

随后仅展开带注解的单项组合，保留联合分支及内外说明；有兄弟断言或引用的包装不动。`/tmp/protection-composition-tests.log` 五文件／23 例通过。新原生批次 `backtest-protection-direct-union-atr-modification-20261116` 三次调用仍未通过：冻结输出附风险预算且 coverage 引用不存在字段；逐期输出正确生成当前 ATR，但又保留旧冻结初始止损，是合法额外规则。不能从这一批将全部旧失败归因为包装。类型 lint 首次指出组合子节点的隐式 any，已收窄为 unknown／明确对象，失败日志保留。

公共能力说明进一步用“投入权益20%”与“允许损失权益2%并按距离定仓”对照，明确逐期 ATR 不附送初始保护；这仍是系统合同说明，成对自然语言输入没有加入字段提示。为保留原消息预算，共享短常量仅在展开总字节数更小时直接内联，断言与数据字面量不变。六文件／27 例通过（`/tmp/protection-examples-tests.log`），新原生批次 `backtest-protection-contrast-atr-modification-20261116` 独立记录。

验收传输捕获已补充最终 JSON：原始流字节继续按原样交给 SDK，单次及流式仅抽取最终内容中的完整 JSON，独立推理字段和非 JSON 文本不保存，残缺输出只记不可用，不修补。该层在最终根校验之前保留配置，因此后续版本／类型拒绝也可核对原值。三个专项反例连同保护及引用测试共三文件／12 例通过（`/tmp/protection-wire-output-tests.log`）；不回填此前未捕获的数据。

对照说明批次三次调用中，逐期 ATR 已完整通过，原始键序为 `version/evaluation/stages/trailing/cooldown`；冻结样本仍额外配风险预算，原始键序为 `version/evaluation/initialStop/stages/riskBudget`，还漏冷却。最终 JSON 与 SDK 解析值均保留。这提供了比提示措辞更具体的结构证据：普通分支只必填前三个核心字段，风险预算分支却把初始保护列为必填，且它位于阶段之前。

核对 [llama.cpp 原生 Schema 转换实现](https://github.com/ggml-org/llama.cpp/blob/master/common/json-schema-to-grammar.cpp)，对象语法先串联必填属性，再按顺序接可选属性。因此在该类解码器中，旧合同一旦先输出初始保护、后输出阶段，就只能走风险预算分支；中文即使明确禁止，也已错过普通保护分支。当前未独立锁定本机 LM Studio 后端的准确构建号，不能据此把本机行为无条件等同于上游最新版；但此顺序冲突可直接由已发送 Schema 和原始输出复核，是后续对照的明确假设。

修正只统一计划分支公共前缀为 `version/evaluation/stages`，之后按初始保护、追踪、冷却排列；风险预算仍必须有无条件初始保护，其他互斥、数值与组合约束均不变。这样先写初始保护不再排除普通分支，不靠服务端识别自然语言。Schema 两文件／七例及原 640 组合的接受结果／合法配置逐项一致，新增公共必填顺序检查；Server 四文件／21 例包含实际生成入口、原生投影与原消息预算通过。新批次 `backtest-protection-prefix-atr-modification-20261116` 保持上一批模型、模式和成对意图，仅另存这次结构修正结果。

中文反例页面分别为 `backtest-protection-extra-budget-browser-20261116`、`backtest-protection-extra-stop-browser-20261116`，各八张四宽双端修改预览。前者显示额外风险预算，后者同时显示旧初始止损与新逐期追踪；脚本逐条比对原配置中文且未发现横向溢出。页面通过仅证明忠实投影，不提升为意图通过。

公共前缀批次最终三次调用中，冻结 ATR 原样通过保存、执行、回放及中文，风险预算未出现；逐期仍同时生成旧初始保护与新追踪，属于合法但额外控制。修改消息随后将范围外冻结字段放在 baseline、旧计划单列 previousTradePlan，当前意图仍在最后；完整操作与 Schema 冻结、修改范围及最终校验不变。`/tmp/protection-target-input-tests.log` 四文件／17 例通过，包括原输入不变和待改计划不混入冻结字段。

`backtest-protection-paired-v5-{atr-protection,condition-protection}-{authoring-modification,authoring,discovery}-20261116` 六组完成，共 18 次实际调用、12 份业务输出，仅发现入口逐期 ATR 一份通过，全部尚未成对通过。两类修改均漏计划且 coverage 指向不存在字段；ATR 编写的冻结样本入场写成已持仓、逐期样本把追踪写成普通 ATR 交叉且漏 high／low；条件编写分别漏计划与 length。ATR 发现冻结样本普通退出写成 `1 eq 1`；条件发现的无条件侧叠加独立止损和风险预算，条件侧把 RSI 上穿移到入场、保护无条件且叠加风险预算。其余合法值已原样保存、执行和完整回放，失败类别逐份保留；不能因保护轨迹碰巧相同而认定完整意图相同。

该矩阵也限制了前述顺序解释：新的普通分支已有可行顺序，条件发现仍主动选择风险预算；其业务 reason 还声称按距离和损失比例定仓，而用户只要求固定投入。顺序冲突是需要修正的协议风险，不能作为后续所有额外规则的唯一原因，更不能从摘要补出其声称的风险意图。只读 LM Studio 模型清单显示当前仅配置且加载该模型，上下文长度 131,072；本批业务输入／输出远低于该容量，未发现容量不足证据。没有加载其他模型、改默认项或变更真实资格。

随后在三个策略使用的引用投影中，让 authoring 覆盖规划先于完整定义，完整定义内计划位于末尾，必填集合与所有字段断言保持；非 Schema 的常量／示例仍不改写。计划四分支直接说明“普通仓位仅附保护”或“明确损失预算才替代普通仓位”等用途。公共例子改为 30% 投入／8% 保护与 1% 损失预算，区别于本轮验收的 20% 投入、5% 或 ATR 保护；提示要求复用本次真实参数，不照抄示例。空仓与恒假退出给出完整 AST，不能将 `isOpen=true` 当空仓或用自身相等冒充恒假。八文件／40 例及 Schema 两文件／七例通过，包含 640 份配置组合等价和原消息预算（`/tmp/protection-coverage-example-{entry,schema}-tests.log`）。首次投影顺序 lint 的 unsafe spread 已收窄为 unknown 数组，最终定向 lint／复杂度无警告。

`backtest-protection-coverage-first-atr-modification-20261116` 三次实际调用、两份业务原配置成对通过。原始根键序为 coverage／definition；冻结侧仅初始 entryAtr，逐期侧仅 currentAtr，均保留 20% 普通仓位、空仓入场、恒假普通退出和 10 根两类平仓冷却，未附预算、其他保护或调仓。原样隔离保存、冻结 Worker、完整重复回放与配置中文通过，双端四宽修改页面为 `backtest-protection-coverage-first-atr-modification-browser-20261116` 十六张。该批证明组合修正后的这两份实际结果，不证明模型稳定全对，也不能唯一归因于某一提示句。

同版其余五组为 `backtest-protection-coverage-first-{atr-protection,condition-protection}-{authoring-modification,authoring,discovery}-20261116`（ATR 修改复用上一段独立命名），各自原始消息、原生 Schema、最终 JSON、解析值、配置、中文及执行结果分别留存。当前仍在执行，完成后单独收口；没有重复同输入只抽成功结果。Server／Desktop 构建退出 0；当前 Domain 104 文件／949 例通过，日志 `/tmp/protection-coverage-final-{server-build,desktop-build,domain-tests}.log`。Desktop 的既有 bundle／依赖警告单独保留，不记为无警告构建。

本轮第一矩阵的四份发现配置另有实际页面 `backtest-protection-paired-{atr,condition}-counterexample-browser-20261116` 各二十四张，覆盖 Desktop 详情／版本和 Mobile 四宽。脚本逐条核对原始配置投影，未用意图修补恒真退出、重复风险或条件位置；这些页面继续只算忠实展示证据。

上述 coverage-first 批次已结束：ATR 修改两份和编写冻结侧通过，编写逐期侧另加普通 ATR 退出；ATR 发现两份实际计划已正确选择，但均仅声明 close，正式装配因缺 high／low 拒绝。条件修改分别有重复需求引用、缺实际覆盖路径；条件编写仍有额外风险预算、漏冷却和条件移入入场。条件发现停在私有资格探针，尚未发出该组业务请求。原始 JSON、失败和通过回执均保留，没有按成交巧合放宽配置断言。

期间另一个活动聊天同时修改了编写提示与操作投影，实际文件修改时间与本批重叠，因此不能将这六组称为同一合同的对照。各次实际消息、原生 Schema 和最终 JSON 以各自捕获为准。用户随后明确允许两个聊天协调；已发送文件分工、冻结共同合同及串行验收安排，保留对方 v24 与新增测试，不回滚其修改。

进一步将预算分支的 riskBudget 改为可选：无预算且有无条件保护的配置，本来就是普通分支已接受的子集，因此联合合同整体接受范围不变，但不再因选择该分支而强迫新增预算。预算存在时仍须无条件初始保护，互斥和原根校验保持。发现入口的 series 字段说明及实际系统消息明确两种 ATR 均依赖 high／low／close；没有服务端补数据字段或删除额外规则。新的等价检查与实际批次另记，不从结构修正直接推断模型意图正确。

精确覆盖合同以已理解需求 ID 的元组约束项数、顺序及每项标识，路径使用实际根字段；保留通用无 ID 调用、完整根和覆盖存在性校验。公共条件示例使用 RSI(6)、70、8% 和三根，均不同于验收的 RSI(2)、60、5% 和十根；不修改自然语言样本。澄清确认摘要中的保护不应复制成普通退出。首次专项测试误用原始 Zod 导出的元组长度，改为核对逐项常量，并在 Server 实际共同投影中核对最小／最大长度及额外项禁令；首次构建暴露动态数组不满足元组类型，改为显式首项加剩余项，两类失败日志保留。最终 Schemas 160 文件／1655 例、入口七文件／54 例、保护执行两文件／11 例通过，三端类型、范围 lint、依赖边界和文件尺寸检查通过；日志前缀为 `/tmp/protection-explicit-coverage-`。

`backtest-protection-explicit-coverage-{atr-protection,condition-protection}-{authoring-modification,authoring,discovery}-20261116` 六组已结束，十八次实际调用、十二份业务输出中七份通过，两组完整成对通过（ATR 修改、ATR 发现）。条件三入口的无条件侧均通过；条件侧仍遗漏 activateWhen，修改侧还漏冷却，编写侧的覆盖另引用不存在的 description。ATR 编写冻结侧遗漏计划而声称覆盖，逐期侧为输出 length。正式拒绝、合法误选、保存及执行分别保留；所有结果都保持 v5，没有补写模型字段。最新 ATR 修改／发现页面分别为十六／二十四张四宽页面，继续仅适用于各自原始输入。

只读使用现有 Ajv 8.20.0 校验实际条件修改 `wire-3-1.json` 的 draft-7 Schema：模型遗漏启用条件的原始对象与独立构造的正确条件／冷却参考对象都通过该 Schema。参考对象仅在分析内存中构造，不保存为模型输出、不执行为实际生成证据。由此确认该次不是 Schema 无法表达条件，也不能据 JSON 格式通过推断语义正确。结合出站必填顺序，将完整编写定义的有计划／无计划拆成等价嵌套分支；有计划分支先写必填计划，条件保护先写必填 activateWhen，再写保护参数。模型必须自己选择分支；省略计划仍可表达纯持有或明确移除，最终范围和根校验不变。后续实际批次单独保存，不重复抽取同合同的成功结果。

`backtest-protection-early-controls-condition-protection-authoring-modification-20261116` 三次实际调用仍未成对通过：两份原始 coverage 均引用 tradePlan，定义却选择无计划分支。原生出站已经确认有计划分支以必填 tradePlan 开始，因此不能继续仅凭字段顺序宣称问题已解决。此前 640 份组合、Schemas 160 文件／1655 例、Domain 104 文件／949 例与入口八文件／59 例分别通过；两份实际失败原样保留，未据引用补写计划。

随后将已知需求的实际编写操作改为固定 proposal 传输包装，在其内部将覆盖与定义绑定于同一分支；无计划分支的覆盖枚举排除 tradePlan。有计划、无计划移除及范围外冻结均有独立正反例。解析只解包，不改定义；原始传输与解析后 DTO 分别保留。原生格式改为与文本一致的 Zod 输入投影，SDK 输出只用一次，避免将解包后的值再作为传输输入解析。专项十七例及 Server 九文件／63 例通过，含三种模式的一次解包与实际受控 HTTP；范围 lint／复杂度无警告。首次构建的 Zod 核心类型窄化和旧 HTTP 三版生成仍使用二版夹具分别修正；原始二版 fixture 留作修改兼容验证，没有放宽生成的三版及价格坐标约束。当前真实批次为 `backtest-protection-linked-proposal-condition-protection-authoring-modification-20261116`，待实际执行、完整回放和中文判定，不计预期成功。

该 linked-proposal 批次三次实际调用结束：无条件侧完整通过；条件侧原始输出已包含正确 RSI(2) 上穿 60 和十根冷却，却把固定 5% 保护写成 `kind=entryAtr`，并遗漏其 sourceId／period／multiple。SDK 按格式拒绝，没有进入保存或撮合。只读 Ajv 8.20.0 对同次实际 `wire-3-1.json` Schema 与 `wire-output-3-1.json` 独立校验同样不通过；条件 ATR 分支的必填集合完整。因此该次是原生模式仍返回不符 Schema 的输出，不能归为投影漏约束，也不能补写模型参数。后续将保护距离种类及参数放在条件之前，分别说明百分比与 ATR 的完整参数；固定样本和自然语言保持原值，实际批次另存 `backtest-protection-type-first-condition-protection-authoring-modification-20261116`。

当前包级 Schemas 160 文件／1656 例、Domain 104 文件／949 例通过；Server 九文件／63 例及保护执行两文件／11 例通过。Server 构建与类型、Desktop 构建及双端类型、依赖边界和文件尺寸检查通过；Desktop 原有 bundle 警告保持。日志分别为 `/tmp/protection-linked-proposal-*` 与 `/tmp/protection-type-first-*`，目标同步与新实际成对结论另验。

`type-first` 条件修改三次调用已结束：无条件侧原样通过；条件侧遗漏启用条件，返回与基线相同的无条件保护，正式修改校验以“建议没有实际变化”拒绝。ATR 双向修改三次调用的两份均通过，原始 proposal.definition 与保存配置深比较相同；初始／逐期保护、20% 仓位、恒假普通退出及十根冷却完整，未增其他控制。ATR 完整编写的冻结侧通过，逐期侧的计划正确却只声明 close，最终以 ATR 来源缺 high／low 拒绝；同次原生 Schema 的 Ajv 校验通过，这是最终跨字段依赖校验，区别于前一批缺止损参数的原生格式失败。编写来源字段的提示需要单独补清，不能服务端自动补数据依赖。

同批 ATR 发现两份均为合法误选：冻结侧把普通退出写成恒真，逐期侧额外加入 15% 初始保护。实际发送消息未包含 15% 的输入或例子；没有证据将该数值归因于服务端模板。这两份原配置的保存、执行、完整重复回放和中文忠实投影均完成，但交易轨迹恰好分别与期望保护轨迹相同，仍被完整配置断言判错。普通退出沿用已有边沿语义，恒真在空仓时就已建立真状态；额外保护在本组行情中未先于追踪触发。不能据本组成交巧合判定模型意图正确，也不据错误意图修改执行引擎。

意图判定补充 60 两侧的上穿边界和相近错误阈值反例；首次反例暴露原稀疏样本会接受 60.005，补充更近边界后，保护执行与意图判定两文件／15 例通过。原模型自然语言、输入和输出均未修改。当前四种固定配置的四宽双端／版本页面共 48 张、条件修改错误原配置的详情对照共 24 张、最新 ATR 修改四宽双端预览 16 张通过；路径为 `backtest-protection-type-first-{fixed,condition-counterexample,atr-modification}-browser-20261116`。错误配置页面仅证明展示忠实，不计意图或真实应用通过。

`type-first` 原生模式完整矩阵最终十八次调用、十二份业务输出中六份通过，仅 ATR 修改完整成对通过。三个条件侧都遗漏启用条件；编写侧另有一份来源缺 high／low 的最终依赖拒绝。原始消息、Schema、值、拒绝及保存／执行均保留，没有重复同输入抽取成功结果。

随后 `backtest-protection-mode-comparison-condition-modification-20261116` 仅在私有资格副本选择 `json_validated`，真实 Provider 不变。两次业务请求与原生对照的模型、完整消息、实际出站消息哈希及输出上限逐项相同；条件／无条件两份均原样通过保存、冻结执行、完整重复回放和中文。JSON 原始 proposal.definition 与保存配置完全相同，分别在 5 月 21 日／5 月 26 日卖出，实际成交价均为含滑点的 8.991，体现启用时点差异。没有固定上游随机种子，该对照支持候选模式可行，不作为所有误选的唯一因果证明。当前重建的修改消息与本批两份捕获也深比较一致。

编写操作的来源 series 字段补充实际 ATR 依赖说明，不自动补数据；之后 `backtest-protection-validated-{atr-protection,condition-protection}-{authoring-modification,authoring,discovery}-20261116` 继续候选模式矩阵（条件修改复用上一段已核对相同请求的捕获）。ATR 修改和发现各两份通过，完整编写逐期侧通过并显式声明 high／low／close；冻结侧用数值 2 填 multiple，严格类型拒绝，原始错误不转换成字符串。编写倍数字段类型提示需单独补清后另留新样本；其余候选组仍按实际结果记录，不据部分通过启用真实模式。正式维护入口已支持明确选择生成模式并将 JSON 模式应用绑定至已审查规划；规划及应用须保留其他用途和 Provider 设置，当前尚未写入真实 Provider。

该首轮 JSON 候选矩阵最终十二份中十份通过；条件发现虽已正确选择上穿启用保护，却遗漏指标 series 输入的 field，严格格式拒绝。另一个失败为前述冻结 ATR 编写的倍数数值类型，两者都不是执行引擎偏差。随后在实际编写入口补充 ATR 参数类型，在实际发现 SDK 入口补充完整指标输入，示例采用 14 期／3 倍和 MA(20)，区别于验收参数。

`backtest-protection-typed-{atr-protection,condition-protection}-authoring-20261116` 两组四份均原样通过；`backtest-protection-typed-existing-authoring-20261116` 原有固定／盈利后追踪两份也原样通过。这六份完整输入、输出、隔离保存、冻结执行、完整重复回放和中文均保留。相同前缀的 ATR 发现冻结侧再次把倍数写成数值，条件发现停在私有资格的 60 秒输出空闲超时，没有进入业务生成；没有扩大时限或预算，也不把该资格失败算成条件模型理解失败。

格式说明进一步提取为共享 `BACKTEST_TRADE_PLAN_ATR_FORMAT_PROMPT`，接入实际编写、修改及发现 SDK 入口；固定的参数类型由说明教给模型，代码仍不转换错误类型或补字段。编写入口的实际文字保持完全相同，当前编译产物重建的四份新保护及两份原有保护消息与捕获深比较一致，因此这六份可按未变输入复用。修改和发现的输入发生变化，须另行成对验证；当前先捕获 `backtest-protection-shared-native-condition-modification-20261116`，确认更新后原生路由是否仍有关键遗漏，再决定真实模式规划。版本继续为 v5，Provider 未改。

目标核对脚本纳入另一聊天已验的 28 个模块，与原 101 个去重后共 116 个，覆盖实际提交、编写校验、保存、版本发布及发现采纳路径；当前宿主编译文件均存在。这里只扩大即将核对的编译模块清单，不冒充已有的目标执行回执。保护意图判定又增加极近错误阈值与精确 60 常量检查，两文件／16 例通过；稀疏行情偶合不能替代参数及完整配置核对。

共享参数说明后的最终关键对照分别为 `backtest-protection-shared-native-condition-modification-20261116` 和 `backtest-protection-shared-condition-protection-authoring-modification-20261116`。各三次真实调用，两份业务请求的完整合同、消息、输出上限逐项相同，仅 mode 不同；实际出站模型及消息字节数／哈希也完全相同。原生侧无条件通过，条件侧仍遗漏启用条件，正式修改入口以没有实际变化拒绝；JSON 校验侧两份原始配置均完整通过隔离保存、冻结 Worker、完整重复回放和中文。条件侧明确 RSI(2) 上穿 60、本轮持仓永久启用、未启用前没有该条保护；没有自动补规则。未固定上游随机种子，因此这是同输入候选模式对照，不能断言模式是所有历史失败的唯一原因。

最终范围 lint、格式、依赖边界和文件尺寸检查通过，日志为 `/tmp/protection-shared-final-{lint,format,boundaries,size}.log`。共享参数说明对应实际入口三文件／12 例通过，Server／Domain 构建通过。真实八条路由与 Provider 设置仍未写入；另三组候选成对生成、当前配置页面及新目标容器验收继续分别记录。

最终共享说明下，ATR 双向修改两份也原样通过：`backtest-protection-shared-atr-protection-authoring-modification-20261116`。ATR 发现批次 `backtest-protection-shared-atr-protection-discovery-20261116` 的逐期侧通过；冻结侧的保护、来源和参数均正确，却将与入场相同的“未持仓”放入普通退出，违背原自然语言的“普通退出始终不触发”。该配置在持仓时退出为假，当前行情仍在保护处卖出，但全状态语义并非恒假，完整配置验收继续判错。原始配置、独立保存／冻结执行、重复完整回放及忠实中文一并保留，不按保护轨迹巧合放宽标准。此处需要纠正发现入口对空仓条件与恒假退出的混淆，不涉及服务端补单或改变既有退出边沿语义。

同版条件发现的无条件侧通过，条件侧原始 JSON 已正确表达 RSI 上穿、固定距离和十根冷却，却生成未要求的 `trailing:{}`，格式拒绝；其入场还使用恒假常量，与空仓入场相反。失败按原值保留。随后只修改实际发现提示，分别校对空仓入场／恒假退出，并明确未要求的可选保护完全省略、不能留空对象；没有改变自然语言、Schema、执行语义或其他两个入口的消息。两文件／八例、Server 构建及该文件 lint 通过。`backtest-protection-exit-check-atr-protection-discovery-20261116` 新两份均原样通过隔离保存、冻结 Worker、完整重复回放及中文，另一组条件发现另记。当前编译入口重建的四份新保护编写、四份修改及两份既有保护消息均与各自捕获深比较相同，复用依据不是版本名相同。

最终条件发现 `backtest-protection-exit-check-condition-protection-discovery-20261116` 两份也完整通过。当前有效矩阵如下，均在私有资格使用 `json_validated`，真实路由尚未变更；其他历史尝试另记，不计入这七组 21 次调用。每组含一次格式资格与两次业务生成，全部 14 份原始配置通过，不能据此推断任意未来输出均正确。

| 实际入口 | 当前捕获目录（位于 `var/acceptance/`） | 成对原配置及执行结果 |
| --- | --- | --- |
| 编写／ATR | `backtest-protection-typed-atr-protection-authoring-20261116` | 冻结 5 月 28 日卖出 6.993；逐期 5 月 26 日卖出 8.991 |
| 编写／条件 | `backtest-protection-typed-condition-protection-authoring-20261116` | 无条件 5 月 21 日卖出 8.991；条件启用 5 月 26 日卖出 8.991 |
| 修改／ATR | `backtest-protection-shared-atr-protection-authoring-modification-20261116` | 冻结 5 月 28 日卖出 6.993；逐期 5 月 26 日卖出 8.991 |
| 修改／条件 | `backtest-protection-shared-condition-protection-authoring-modification-20261116` | 无条件 5 月 21 日卖出 8.991；条件启用 5 月 26 日卖出 8.991 |
| 发现／ATR | `backtest-protection-exit-check-atr-protection-discovery-20261116` | 冻结 5 月 28 日卖出 7；逐期 5 月 26 日卖出 9 |
| 发现／条件 | `backtest-protection-exit-check-condition-protection-discovery-20261116` | 无条件 5 月 21 日卖出 9；条件启用 5 月 26 日卖出 9 |
| 既有编写回归 | `backtest-protection-typed-existing-authoring-20261116` | 固定／盈利后追踪两份均通过 |

价格单位为元，日期为模拟的 2026 年交易日，时间统一为后续可交易开盘。发现意图指定零佣金／滑点，编写／修改保留原确认的费用，因此两类实际成交价有所区别；市场费用仍按冻结规则计入。每份原配置均隔离保存、冻结实际 Worker，完整结果和重复全量回放一致，中文直接读取配置。十份编写／修改的原始 `proposal.definition` 与保存配置逐项完全相同，传输包装只解包；发现入口沿用冻结元数据装配，不新增交易规则。

正式只读规划 `backtest-protection-mode-route-draft-20261116/plan.json` 已生成：三个用途均保持各自 v5，仅 `native_schema` 改为 `json_validated`；其他五条路由逐项保持，模型、费用、时限及其他设置沿用。规划指纹 `3c437683f975a4d572250bee7676d2a7617de26b2a45adc393f0ed395a257ee5`，待验三个用途、最多三次调用，预计 USD 0。真实保存须用户另行确认，再绑定本规划指纹和配置修订；当前没有执行应用。目标验收脚本显式接收预期模式并逐项核对，不会因验收自行改路由。

用户随后明确选择保持真实路由原生模式，上述模式规划撤回、未应用；不再将真实模式变更作为本任务的解除条件。仅为该规划新增的模式应用参数已移除，目标检查继续强制原生模式，八条真实路由和 Provider 零写入。JSON 的 14 份成功捕获继续作为诊断及独立执行证据，不能替代原生入口验收。

源码正式同步 `/tmp/protection-final-source-sync.log` 退出 0，Server／Worker 均健康且镜像保持原值，无数据库结构或卷变更；随后开始当前编译基线的 50 份／116 模块目标验收。该阶段与后续原生 Schema 调整分别留证。最终候选页面的条件发现首次在版本视图失败，原因为验收脚本将所有非 actual 坐标都预期为后复权，而页面正确显示 run 的“本次运行价格”；仅修正脚本标签字典，原失败目录保留。最终新保护 128 张和既有保护回归 24 张四宽页面通过，配置中文逐项匹配，未改产品文案或模型数据。

继续原生修正时，将同一距离种类重复的条件／无条件四分支合并为两分支，每种保留可选完整条件树；所有距离参数、严格对象及原始最终校验保持。原 640 份组合的接受结果和合法值逐项一致，Schema 专项两例及实际 SDK／引用／消息三文件十七例通过，Server／Schemas 构建另记。这里仅验证结构等价，实际原生模型结果尚待新捕获，不据 Schema 简化宣称语义问题已解决。

上述目标执行基线 `backtest-protection-target-native-baseline-20261116/receipt.json` 已通过：Server／Worker 各 50 份，116 模块哈希一致，完整结果／重复回放及所有中文与原捕获相同，模型调用与业务写入为零；三个真实 v5 用途均原生且 ready。该回执对应两距离分支简化之前的编译基线，含 JSON 候选生成的独立配置，证明执行及展示，不冒充原生生成或随后修改的模块部署证据。

另发现公共条件例子仍把 activateWhen 写在距离种类／参数之前，而实际原生语法必填顺序先写 kind／percent；JSON 模式允许该例子顺序，原生路径会受必填顺序约束。公共例子现已对齐为先距离参数、后启用条件，语义及所有示例数值不变，自然语言样本未加字段提示。消息预算与实际编写提示两文件十一例通过，Domain 构建通过；新捕获为 `backtest-protection-native-distance-condition-modification-20261116`。重复分支与示例顺序同时修正，不能将结果单独归因于其中一项。

该两距离捕获最终失败：无条件侧通过，条件修改仍省略启用条件，原始配置与基线相同，正式修改入口拒绝无实际变化；三次调用全部留存。同一实际 wire Schema 的独立校验接受该错误无条件配置，也接受仅在内存补完整条件的参考配置；参考配置未作为模型输出保存或执行。这是模型选择错误的合法结构，不能归类为执行补单或 Schema 无法表达。

随后引入显式 activation，并贯通规范校验、生成／局部修改、依赖、坐标投影、永久启用记忆、中文和规则编辑器；历史 activateWhen 与无条件配置仍原值读取，双填拒绝，修改其他根不迁移旧保护。专项 Schema 两文件十二例、Domain 四文件二十八例通过；全量 Schemas 一百六十文件／一千六百五十七例、Server 四文件二十二例及 Worker 五文件二十八例通过，双端类型检查通过。最初全量两个正向生成样本仍使用旧隐式格式，更新受控测试样本后通过，历史数据未改。

`backtest-protection-explicit-activation-condition-modification-20261116` 三次原生调用仍失败：模型保留了 RSI(2) 上穿 60 的完整条件，却把明确的 5% 距离改成 14 期、3 倍 ATR；无条件侧原样通过。错误来自 wire 原始 JSON，完整意图断言未放行。其两个距离分支均先展开相同的启用条件树，距离差异位于后部；现调整为先距离种类／参数、后独立启用方式，公共例子同步顺序。该原因仍是待验证假设，不把字段顺序宣称为唯一根因；自然语言、真实原生路由、v5、模型及参数保持原值。新捕获 `backtest-protection-native-explicit-distance-condition-modification-20261116` 单独留证。

距离先行捕获仍失败，条件侧合法地选了 immediate。随后 `backtest-protection-native-intent-check-condition-modification-20261116` 在固定包装中要求模型先简短核对意图，三次调用后同样失败：核对文本准确写出 RSI(2) 上穿 60 后启用 5% 止损，但原始配置仍为 immediate；不据核对文本补配置。这进一步区分需求理解与配置选择，不能声称已解决。新的意图回归十一例明确拒绝这两种合法误选。

检查实际 Schema 后发现普通保护之外还存在可省略预算、却强制立即保护的重叠子集分支。现将可选预算合入普通分支，去掉重叠无条件分支；月末／波动率仍各自严格互斥，预算必须有立即初始保护的相同最终校验保留。640 份语义组合及专项两文件十二例通过，不能据此推断上游语法实现或模型选择已正确；新原生捕获 `backtest-protection-native-disjoint-condition-modification-20261116` 独立验收。此前两个现金资料跨仓测试在全量并发中超时，定向两文件二十例复跑通过，保留超时日志；没有改时限或生产行为。

显式启用编辑器的独立样本 `backtest-protection-activation-editor-20261116/result.json` 共二十四例，覆盖新立即／新条件／历史条件、双端和四宽。打开及保存逐项一致，距离编辑保留启用方式与原始十进制精度，条件切换为立即会移除条件；全部 API 写入拦截在浏览器内，真实业务写入为零。双端编辑器各五例、Desktop 构建及文件尺寸门禁通过；已检查条件 Mobile 390 页面，条件与执行时点直接读取实际配置。

三分支诊断最终失败，两侧均选错合法结构；条件侧还擅加 20% 风险预算。原始核对仍正确，故不把分支合并视为修复，已恢复原有四分支及原生预算前置约束。随后定位一个实际投影遗漏：第一次注解清理发生在引用内联前，内联后新产生的 `allOf:[{anyOf:…}]` 未再次清理。补上展开后清理，并修复无引用注册表时丢弃已清理结果的返回路径。新专项证明内外说明和原始断言不丢失、输入不被修改；四文件二十二例通过。

`backtest-protection-native-composition-condition-modification-20261116` 同一自然语言成对修改最终全部通过，三次调用；实际 wire 的止损联合不再残留冗余 allOf，带阶段长度断言及共享引用的必要包装继续保留。两份原始定义分别为 5%／immediate 和 5%／RSI(2) 上穿 60 条件，完整原样保存、冻结 Worker、完整重复回放及配置中文通过。该结果支持投影修正，但未固定随机种子，不宣称其为所有误选的唯一原因或未来生成保证。原审计核对字段保留，不用其修补配置；准备的显式 JSON 复制诊断未调用，临时代码已撤去，不作为业务证据。剩余五组成对生成及既有保护回归按同一最终合同另验。

当前 Domain 全包一百零五文件／九百五十七例及合同／SDK／语义六文件三十五例通过，保持预算、期限和真实路由原值。旧双容器一百一十六模块回执仍只对应旧编译基线；新模块部署尚待本轮原生矩阵通过。

最终组合投影下的 `backtest-protection-native-composition-atr-protection-authoring-20261116` 未整体通过：逐期侧原样保存、执行与回放通过；冻结侧距离／启用规则正确，但来源坐标选为 actual，被同一 Canonical 的 ATR 来源规则拒绝，不能计为成功配置。该错误属于生成配置未过校验，不是引擎执行偏离。实际提示另有“根只有 proposal”与新增 intentCheck 冲突，已对齐为核对后生成建议；补充 ATR 来源只用 research／run、不能因成交价锚点而选 actual 的说明，保留一般实际价格条件的合法表达。范围外旧来源仍冻结，不自动换坐标。

最终四分支源码的 Schemas 一百六十文件／一千六百五十七例串行全包通过；Server 构建已确认退出零，冻结／修改／依赖等六文件二十九例、最终提示三文件十五例及 Mobile 类型检查通过。前一次 Server 构建仍运行时的进度曾说早，已更正并等待真实完成。发现消息不受这次编写坐标说明影响；新三入口七组矩阵分别使用 `native-composition` 发现目录与 `native-coordinate` 编写／修改目录，均在真实模式不变的私有资格副本验收。旧已通过的条件修改仍保留，但不能替代当前编写提示的重新验证。

上述两组 `native-composition` 发现均在本地格式样本预检失败，未发出模型调用：既有探针实例的初始保护仍缺新必填 activation。已将正式探针实例更新为显式立即启用，匹配测试及 HTTP SDK 两文件四例通过；失败目录保留，不计作模型理解失败。目标哈希清单纳入新编辑模块及正式发现探针，共一百一十八模块，部署回执须另验。

`backtest-protection-native-coordinate-atr-protection-authoring-20261116` 与对应 `authoring-modification` 各三次原生调用、两份原始配置全部通过隔离保存、实际冻结 Worker、完整重复回放及中文。编写二十四张四宽页面通过，修改页面另验。同版条件编写无条件侧通过，条件侧的 RSI 上穿、5% 距离及启用方式均正确，但交易所 ETF 的来源选择 native-nav 并加入 nav Series，最终 Schema 拒绝；原始 wire 留在 `backtest-protection-native-coordinate-condition-protection-authoring-20261116`。这属于来源配置错误，不计为执行偏差，也不能仅据保护字段正确而判整组通过。

全工作区 guardrails 首次使用默认 Node 堆在 Desktop lint 内存不足；仅提高验证进程堆上限后继续，发现本轮 Schema 测试的未使用变量，已修正。最终 `/tmp/protection-composition-workspace-guardrails-final.log` 八组四千一百零七文件通过，存量市场历史 Schema 两条复杂度警告保留；没有修改模型参数或生产内存。修正后的保护兼容专项十例通过。自检文本仅在验收原始 wire 中留存，业务解包输出不含该字段，没有将此扩大为新增生产审计存储。

当前提示的 `backtest-protection-native-coordinate-condition-protection-authoring-modification-20261116` 三次原生调用、两份均通过，分别显式立即启用与 RSI(2) 上穿 60 后永久启用。两份原始定义完整保存，实际卖出分别为 5 月 21 日、5 月 26 日，成交价均为含滑点的 8.991；完整结果与重复回放一致。当前 ATR 修改及条件修改各十六张四宽双端预览通过，目录分别为 `backtest-protection-native-coordinate-{atr,condition}-modification-browser-20261116`。编写失败与修改成功按各自实际输入区分，不能拼作一组。

同版既有保护回归 `backtest-protection-native-coordinate-existing-authoring-20261116` 的追踪侧通过；固定侧在正确的 5% 计划保护之外，又生成普通退出“研究收盘价下穿常量 0.95”，最终坐标校验拒绝。该额外比较已在 wire 中存在，未被服务端补写。保留失败后，仅对已确认资产的新编写操作收紧来源枚举，并在普通退出字段旁说明计划保护不能重复映射为价格常量比较；不解析摘要来替模型构造退出。Schema 原生投影同时覆盖股票／ETF 与基金，专项两文件十二例通过；局部修改合同及发现输入不受此操作分支调整影响，复用须逐项核对实际请求。

当前编译源码重建两组修改的完整消息及原生 wire Schema，四份分别与 `native-coordinate` 原捕获深比较完全相同，故修改成对证据可复用。四份消息 SHA256 依次为 frozen-atr `46b735f19791669007ea2a93935e18eac90503140e3a374bdab03689fce0425f`、current-atr `2466e3dc843ddc9cb2ee64f70cbcdc6ee1083a073e3edf626cbb2ab698577e4c`、unconditional-stop `73e62fc42c7f8ef2401eefcb59f43002b88ae76249494eee06d62c71ed524dcf`、armed-stop `a5e187e5f9ca5f070d1b013afc0bd15eb8c59c26be070f7210fb4259ebe514be`；四份原生 Schema SHA256 均为 `8a0ee5614004e84683c2ff9a49d903d3f319d1c8d19750b2dffe85902014e34a`。本次不按版本号相同而推断请求相同。新编写的实际合同已变化，两组新保护及既有保护均另发新请求，目录前缀为 `backtest-protection-native-confirmed-`；发现以修正后的正式探针重新资格，前缀为 `backtest-protection-native-probe-fixed-`。

最终已确认来源的源码版本：Schemas 全包一百六十文件／一千六百五十七例通过，SDK／提示／探针四文件十二例、范围 lint／格式通过，Server 构建确认退出零。模型、期限、模式及真实八路配置保持原值，后续实际模型和部署另记。

修正探针后的两组发现仍未整体通过。`backtest-protection-native-probe-fixed-atr-protection-discovery-20261116` 的冻结侧通过；逐期侧虽写对追踪，却擅加 0.01 倍入场 ATR 初始止损与 1% 保本，完整配置验收拒绝。`backtest-protection-native-probe-fixed-condition-protection-discovery-20261116` 的无条件侧输出空闲超时，条件侧写对保护却把 RSI 上穿也复制为入场，违反空仓直接入场。错误合法配置的保存、执行、回放及中文均保留，不能把保护字段正确或成交偶合当作理解正确；超时与语义误选分开记录，期限不调整。

随后仅修改发现生成的规则核对顺序：新生成合同在 strategy 之前必填原有 reason，分列入场、普通退出、保护距离／启用、仓位及等待；提示强调不得为优化附送初始保护、保本或把启用条件改为入场。原输出读取合同仍允许历史 reason 缺省，装配交易含义不读取该文本；新生成与历史读取分开。新专项证明核对说明不能改写策略且历史响应仍可读，两文件十一例通过。此时三组编写仍使用已构建的原输入串行验收，不重建依赖；发现的新编译和两组成对实际生成在该队列结束后进行。

该编写队列结束：`backtest-protection-native-confirmed-{atr-protection,condition-protection}-authoring-20261116` 两组各三次调用、四份原始配置全部通过保存、Worker、完整回放及中文，各二十四张四宽页面通过。`backtest-protection-native-confirmed-existing-authoring-20261116` 固定侧通过；追踪侧核对文本正确，但实际计划漏 trailing 和 cooldown，完整意图验收拒绝。未据文本补字段，也不把同组固定成功与旧追踪成功拼接。

继续只对新编写操作的计划对象补清逐项落字段：通用字段可省略不等于当前明确要求的保护或等待可丢掉，初始／追踪／盈利门槛／冷却各按本次要求填写，结束前核对完整控制。没有新增摘要解析器、运行修补或约束放宽。该说明不影响局部修改或发现合同；三组编写须再按实际新输入验收。发现的新 reason 合同与旧响应读取保持分离；既有说明矛盾拒绝校验仍在，说明不能生成或替换交易规则。

此时 Schemas 全包一百六十一文件／一千六百五十八例、Schema 类型、Server 八文件三十四例通过，另一个显式原始捕获复现用例未启用而跳过。全工作区 guardrails 八组四千一百零八文件通过，保留当前共享工作区的复杂度警告。新代码文件格式通过；`ai-execution.ts` 与本证据的整文件格式检查仍涉及既有未格式化行／表格，只校正本轮变更行，不重排其他任务代码或历史表格。

新计划对象说明下，`backtest-protection-native-complete-existing-authoring-20261116` 三次原生调用、固定／追踪两份全部通过。固定 5% 初始保护、盈利 10% 后回撤 5% 追踪及十根冷却均按各自要求实际配置；原样保存、冻结执行、完整回放及中文一致，二十四张四宽页面通过。继续编写下一组时在申请维护锁前退出，零模型调用、无捕获目录，日志为 `/tmp/backtest-protection-native-complete-atr-protection-authoring-20261116.log`。

曾尝试让整批 Python 编排共用一把正式锁，正式入口因只接受登记的 Node 维护脚本而在执行前拒绝；`/tmp/protection-native-current-matrix.log` 保留，未调用模型。已恢复每组登记 Node 脚本流程，仅对“未取得锁、未创建捕获目录”的明确锁竞争等待重试，不自动重试任何模型或执行失败。后续编排在私有目录 `backtest-protection-native-current-matrix-20261116/run.py`，ATR 新捕获使用 `backtest-protection-native-complete-lock-retry-atr-protection-authoring-20261116`，原锁失败日志不覆盖。当前 Server 构建、Desktop／Mobile 类型检查已确认退出零；最终编译重建的四份修改消息及原生 Schema 仍与原捕获完全一致。

`backtest-protection-native-complete-lock-retry-atr-protection-authoring-20261116` 三次原生调用、冻结／逐期两份全部通过，未增其他保护控制，原始定义保存与实际冻结 Worker、完整回放及中文一致；当前四宽页面另留新目录。该原始输入对应最新计划对象说明，不用上一版编写成功代替。条件编写及两组发现继续按冻结源码分别验证。

该 ATR 最新四宽页面二十四张通过，当前中文与捕获相同。`backtest-protection-native-complete-condition-protection-authoring-20261116` 三次原生调用、立即／条件启用两份也全部通过保存、Worker、完整回放与中文，页面另验。最终原生编写三组成对及修改两组成对均通过各自当前请求；剩余两组发现继续使用先核对 reason 的新传输合同。

最终条件编写二十四张四宽页面通过，五组共十份原始 wire 的 `proposal.definition` 与最终保存 configuration 逐项深比较完全相同；每组三次调用、真实 Provider／历史写入均为零。页面抽查包括当前条件修改与既有追踪的 390 窄屏，中文能区分普通退出恒假、立即初始保护、盈利门槛后追踪及条件永久启用。核对文本只在 wire 中留存，不参与补写配置。发现的冻结 ATR 新生成已通过，逐期侧及另一组成对仍在运行。

先核对 reason 的发现批次最终结果：`backtest-protection-native-reason-condition-protection-discovery-20261116` 两份通过；`backtest-protection-native-reason-atr-protection-discovery-20261116` 冻结侧通过，逐期侧在准确核对后仍额外加入 5% 初始保护，完整意图验收拒绝。reason 没有要求该初始保护，服务端也未据文本修补，错误原值的执行／回放／中文保留。因此核对顺序本身不能被宣称已解决原生配置误选。

继续定位生成合同的具体重叠：预算分支曾允许省略 riskBudget，却强制立即初始保护，因而把无预算的普通保护子集重复放入预算分支。现保留四种能力分支，预算分支必须有预算本身；预算、月末、波动率各把本身必填控制放在对象首位，普通分支仅保留普通保护与阶段。各特殊分支由严格对象的必填控制项区分，不再依赖相同公共必填前缀选择子集。640 份新旧组合的最终接受结果及合法值仍一致，三文件十三例通过。该结构问题明确存在，但不能据此宣称它是所有随机误选的唯一原因；必须重验实际生成。

这次改动影响三个入口的共享生成 Schema，之前所有成功批次继续按原实际请求留存，不作为新输入生成证明。保持 v5、真实原生路由、模型、参数、输出及期限不变，重新按三入口七组验收；没有补配置、放松最终校验或删除失败。

分支互斥后的 `backtest-protection-native-exclusive-atr-protection-discovery-20261116` 三次原生调用、冻结／逐期两份全部通过，未附额外初始保护、保本或其他控制；原始配置、隔离保存、实际冻结 Worker、完整重复回放和中文一致。该结果支持结构修正，但不将一次成对成功解释为所有历史误选的唯一原因或未来正确率保证。其余六组保持同一冻结源码继续验收，浏览器编排逐组跟随已通过原配置，失败和未完成不会计入成功矩阵。

### 最后一轮收敛边界与摘要准入修正

用户明确要求按当前方案收尾，保留修改与失败证据，不再扩充协议或反复重跑整套验收。业务实现、v5、真实原生路由、模型参数及已有 intentCheck／reason 传输冻结；本轮七组固定输入各运行一次，不因误选继续追加提示或重采样。未变化的执行、编辑器与页面证据按实际输入复用。

局部移除发现准入中的模型 reason／description 矛盾推断，以及编写准入中的模型 description 和加仓百分比文本推断；编写修改复用相同结构准入。没有从摘要补单、改比例或替换交易计划。保留最终 Schema、来源／引用、冻结事实、修改范围、覆盖引用，以及账户执行的资金、数量、持仓、幂等和事件顺序约束；用户明确确认的普通信号交叉方向检查保留。历史语义诊断工具与失败回执原值保留，但这些模型摘要诊断不再接入候选准入。

定向五文件首次运行四十五例通过、一例历史捕获复现跳过、两例保存失败；原因是独立测试夹具仍为 v2，而当前保存要求显式 v3。仅将该测试夹具明确声明为 v3／run 坐标后，相关六例全部通过；其余四文件四十一例通过的结果复用。新增断言证明说明写 0.5% 而结构配置为 0.5 时，保留原配置且中文展示 50%，不猜测修补；保存、范围与确认约束继续通过。日志为 `/tmp/protection-summary-admission-tests.log` 和 `/tmp/protection-summary-admission-authoring-tests.log`。

当前最后一轮中，两组发现和既有固定／追踪编写回归通过。ATR 编写的冻结侧通过，逐期侧虽正确填写 currentAtr，却额外生成“研究收盘价等于 0”的入场条件，被混合价格坐标约束拒绝；原始 wire、完整生成值和错误回执留在 `backtest-protection-native-exclusive-atr-protection-authoring-20261116`。这不是 Schema 无法表达逐期保护，也不是执行引擎擅加规则。该组不拼接旧成功，不重采样；余下独立组继续。

### 最后一轮原生模型结果

七组均使用冻结输入，各一次；每组三次调用，含一次私有格式资格和两次业务生成，合计二十一次零费率本地调用。真实 Provider 与历史业务写入均为零。目录统一为 `var/acceptance/backtest-protection-native-exclusive-<能力>-<入口>-20261116`，原始请求、wire、输出、配置、中文、事件、冻结快照及完整结果分别留存。

| 能力 | 实际入口 | 成对结果 | 独立行情下实际卖出日期 |
| --- | --- | --- | --- |
| 冻结／逐期 ATR | discovery | 两份通过 | 2026-05-28／2026-05-26 |
| 立即／条件保护 | discovery | 两份通过 | 2026-05-21／2026-05-26 |
| 既有固定／盈利后追踪 | authoring | 两份通过 | 2026-05-26／2026-05-25 |
| 冻结／逐期 ATR | authoring | 冻结通过；逐期配置被拒 | 2026-05-28／未进入执行 |
| 立即／条件保护 | authoring | 两份通过 | 2026-05-21／2026-05-26 |
| 冻结／逐期 ATR | authoring-modification | 两份通过 | 2026-05-28／2026-05-26 |
| 立即／条件保护 | authoring-modification | 两份通过 | 2026-05-21／2026-05-26 |

合计十四份业务输出，十三份通过、六组完整成对通过。通过者原样保存并运行实际冻结 Worker、完整重复回放及配置中文；没有把 ATR 编写冻结侧和旧逐期成功拼成通过组。ATR 编写失败是模型擅加条件导致非法价格比较，保留结构门禁，未放宽或修补。先前合法结构中的额外初始保护、保本和错误启用条件仍按原回执记模型语义失败；本轮没有发现执行引擎增添规则。

当前六个通过组的浏览器跟随已完成：Desktop 与 Mobile Web，1440／1024／768／390，合计一百二十八张页面；修改展示原计划与建议计划，其他入口展示配置摘要和版本详情。ATR 编写整组跳过本轮页面计数，已有未变化布局与编辑器证据按原输入复用，不重新跑全套截图。浏览器日志为 `/tmp/protection-native-exclusive-browser-matrix.log`；模型编排日志为 `/tmp/protection-native-exclusive-matrix.log`。

最终部署仅选择这六个完整通过组的十二份配置及四份既有兼容对照，共十六份；不引入失败组的半组或旧模型替代成功。既有 AC01～AC12 和编辑器未变化证据继续保留，旧双容器五十份／一百一十六模块不替代新编译哈希核对。后续只执行一次必要正式同步和目标验收，不追加模型调用。

### 最终同步、目标与收尾

摘要准入移除后，首次 Server 构建发现保存入口尚传旧的第三个文本推断参数，日志 `/tmp/protection-summary-final-server-build.log` 保留；局部移除该实参并改正注释，保存定向六例及该文件 lint 通过，最终构建 `/tmp/protection-summary-final-server-build-fixed.log` 退出零。没有更改生成提示、Schema 或模型设置。

只读脚本 `var/acceptance/backtest-protection-native-exclusive-matrix-20261116/audit.mjs` 核对十四份最终捕获：编写／修改完整消息相同，发现业务提示及文本 Schema 相同，全部原生 wire Schema 相同；通过者的最终配置原样通过当前装配／准入，失败配置仍被结构约束拒绝。脚本首次误从精简 receipt 读取操作而缺字段，修正为读取独立样本文件后通过；两个日志均保留，未重新调用模型。最终结果 `/tmp/protection-native-exclusive-final-input-audit-fixed.json`，模型调用和业务写入零。

仅执行一次 `infra/scripts/sync-code.sh thesis-ledger`，日志 `/tmp/protection-native-final-focused-sync.log`：退出零，Server／Worker 健康，镜像保持原值，无数据库结构或外部卷变更。随后经正式维护锁运行登记的目标核对入口，回执 `var/acceptance/backtest-protection-target-native-final-focused-20261116/receipt.json`：两个实际容器各十六份，一百一十八个当前编译模块哈希一致，全部完整结果、重复回放与配置中文一致，目标模型调用和业务写入均零。三个真实用途均为 v5／native_schema／ready，未写入 Provider。

最后只读查询真实 lmstudio settings，与本轮捕获深比较完全相同，规范化 SHA256 为 `90bf8063714a59a8bc2c3c16bcad51147807fecd7a375d807e457def8afc2d25`，结果 `/tmp/protection-native-final-provider-invariant.json`。未输出凭据；未修改其余用途、模型参数或期限。

本轮按收敛边界结束，T04e.6c 合格配置执行消费与 T04e.6d 显式启用兼容分别完成；T04e.6b 的 ATR 编写成对缺口保持未完成，不宣称全部模型理解正确。T04e.2 真实分钟来源证明与 T04d 委托／部分成交合同仍未完成，未移动到 TODO 或关闭总任务。其他任务的工作区修改、历史失败决策和所有中间回执保留，不暂存、不提交。

### ATR 编写逐期侧的只读归因

本次将 `backtest-protection-native-exclusive-atr-protection-authoring-20261116/current-atr.json` 记录为模型擅加入场条件。用户要求空仓投入权益 20% 买入；原始 `wire-output-3-1.json` 的 intentCheck 正确复述该要求，但 definition.entry 实际生成 `not isOpen AND main.close == 0`，而普通退出另行正确填写 `0 == 1`。额外比较在模型原始输出中已存在，原始 proposal 与适配器 response-3.json 的 output 完全相同。它改变了入场条件，不能作为无害占位规则处理。

请求、合同与对照的只读核对结果：

- `request-3.json` 明确为 authoring-generation-v5／native_schema；系统提示给出空仓的 not isOpen 写法，用户输入及确认未要求零价格入场。实际 HTTP 消息按捕获器的 JSON 序列化方式核对字节数及 SHA256，与记录请求一致。
- 同组冻结侧成功样本与逐期侧失败样本的系统提示、完整原生 Schema 完全相同。Schema 允许通用布尔条件组合，但没有强制或默认增加零价格比较；数值模式也允许非零常量，未将模型限制为只能输出 0。因此，现有证据不支持“合同要求生成该条件”。
- 失败发生在 entry.conditions[1]：研究价格与具体价格常量比较违反最终价格坐标约束，未进入执行。只在内存副本中去掉该额外条件、保持 tradePlan 及其余配置不变后，完整 Schema 通过；未保存修正版、未替换原始回执。这支持逐期 ATR 能力可表达，本次失败由额外入场条件引起。

示例串扰仅为推测：提示中有普通退出恒假的 `0 == 1` 示例，入场又使用可组合的通用 AST，可能为错误拼接提供素材；但没有保存的模型推理或单变量对照实验能证明零常量来自该示例。同组成功与失败只能排除合同必然要求这条规则，不能证明提示对误选概率完全没有影响，也不能把其他合同结构问题确定为本次原因。

本次结论不改变原验收计数与失败状态：T04e.6b 保持未完成，真实分钟来源证明及委托／部分成交合同缺口保留。前次只读分析没有模型调用、文件修改或验收重跑；本次仅将结论补入 Task 和证据。保持 v5、真实原生路由及模型参数，不再为此样本改合同、加提示词或重跑验收。原始请求、wire、输出、失败回执和此前所有成功／失败证据保留。

### 订单合同与纯日线撮合首批

用户确认 D01～D04 推荐组合后，已将行为及 AC15～AC21 纳入正式 Spec，从 T04d.2 开始实施。2026-11-17 检查点：共享 main，未暂存；v5、真实原生路由和模型参数未修改。ATR 失败不参与本批输入或重跑。

Schemas 新增 `backtest-daily-orders.ts`、`backtest-daily-order-validation.ts`，Domain 新增 `backtest-order-contract.ts`、`backtest-order-state.ts`。模板明确建仓／普通退出、父单及 eachFill／fullFill、独立有效期、关联退出组与价格表达式；检查重复／未知引用、实际买入阶段与来源。状态保留已成交与撤销余量、触发事实及稳定成交标识，JSON 往返后重复成交仍幂等。旧 Canonical 执行入口仍只接受旧配置，新合同暂未接入，不存在忽略新委托后按市价执行的降级。

Domain 独立新增 `backtest-daily-order-price.ts`、`backtest-order-protection.ts`、`backtest-daily-matching.ts`。逐根开盘／区间推进复用数量取整原语，成交可用量和实际执行通过明确回调接入后续账本与市场规则。纯模块验证价、量、冲突、保护余量和事件顺序，不等同正式 Worker 已支持部分成交。

最终定向结果：Schema 十三例、订单状态十例、纯撮合九例，共三十二例通过；两包类型及 build 通过，Import boundaries 通过。日志分别为 `/tmp/backtest-order-matching-schema-tests.log`、`/tmp/backtest-order-matching-domain-tests.log`、`/tmp/backtest-order-matching-{schema,domain}-types.log`、`/tmp/backtest-order-matching-{schemas,domain}-build.log` 及 `/tmp/backtest-order-matching-boundaries.log`。范围 lint 首次发现测试未使用导入，已移除，最终结果另记；未运行无关全包、模型、浏览器或部署验收。

通过的关键反例包括：两根未触价到期；双触止损优先而已知开盘止盈不回写；开盘／区间建仓不同的保护时点；买十撤十七再退出四只护六；部分止盈后剩余止损保留、零额度仍触发且后根不需再次穿价；多单共用额度、拒单不扣量、重复根不刷新；原始数量手数与连续研究单位分开；父单份额退出不关闭仍有份额的另一父单，完整纯模块重放一致。

T04d.2／3 的本地合同与纯模块验证完成，账本／计划、冻结市场规则／Worker、实际模型、中文和目标验收仍由 T04d.4～8 持有，不沿用旧能力回执推断通过。

### 日线订单的账本与计划接缝

2026-11-17：新增 `BacktestDailyLedger`，连接上一批纯撮合与实际 SimulationLedger；资金预留、实际成交、分批费用、持仓结算与计划记忆在这一接缝推进。冻结市场规则的成交校验和日历结算日期由调用方提供，控制样本不是市场来源资格或正式 Worker 验收。

旧账本首笔成交会释放整单预留，旧计划首笔成交会清 pending 且只记录首次数量；现提取 `simulation-cash-reservation.ts`，允许在同笔扣款中保留余单占款，原整笔省略字段时语义保持。计划 accept 可明确订单是否终止，首张订单累计实际成交，撤余单后冻结初始基数；部分建仓不启动分批阶段，但保护性收盘退出仍可产生。新订单运行的最低佣金及平台费用按订单累计，逐笔税费仍按本笔金额，费用预览在拒单时不提交累计记忆。

新增账本接缝十一例通过，覆盖成交十撤十七／再退出四仅护六、含费预算缩量、跨根最低佣金、冻结费用中佣金与税费口径、部分退出到完整平仓才重置、可售结算前不卖出、拆股后余量／保护价调整及重复拆股不再应用。直接受影响的旧 SimulationLedger 十例与交易计划八例通过；未运行无关包或实际模型。

日志：`/tmp/backtest-order-ledger-tests.log`（新五例与旧十八例）、`/tmp/backtest-order-fees-tests.log`（新增费用断言后的六例）、`/tmp/backtest-daily-ledger-split-tests.log`（实际接缝五例含拆股）、`/tmp/backtest-daily-ledger-types-fixed.log`、`/tmp/backtest-daily-ledger-build.log` 及 `/tmp/backtest-daily-ledger-lint-fixed.log`。类型检查曾发现费用舍入参数和 exactOptionalPropertyTypes 不匹配，已局部修正；lint 的未使用／类型导入问题已修正，失败日志保留。T04d.4 本地接缝完成，T04d.5 冻结市场规则／Worker 仍未通过。
# 日线委托的原事件队列与冻结成交规则接缝

2026-11-17，T04d.5a。新增 `executionPhase` 接回原 `DeterministicSimulationEngine`，成交事实在同收盘信号前登记；既有市场／公司行动／估值队列继续使用。`backtest-daily-engine.ts`、`backtest-daily-order-submission.ts` 和 `backtest-daily-venue.ts` 分别负责事件装配、下单时价格／数量／预算冻结、冻结市场约束／费用／交收。未新建执行服务或队列，旧市价分支保留。

`backtest-daily-engine.test.ts` 四例验证：区间买单当天建立保护、下一根才可撮合；开盘买入后当根区间保护、双触止损优先；冻结 CN T+1 先交收再开盘，已触发余单无须再次跌穿；两根未触价到期且持续真条件不重挂。第一例完整重跑严格相等。`backtest-daily-ledger.test.ts` 补一例完整行情晚五分钟可见，成交／结算均不早于实际可见时点，共六例通过。旧事件引擎两个文件及同收盘成交优先的单例已通过，复用该未变输入证据。

命令与日志：`/tmp/backtest-order-engine-current-tests.log`、`/tmp/backtest-daily-ledger-clock-tests.log`、`/tmp/backtest-daily-ledger-clock-types.log`、`/tmp/backtest-daily-engine-tests-fixed.log`、`/tmp/backtest-daily-engine-types-fixed.log`。首轮新测试误读不存在的 `result.orders` 已改为实际 `targetIntents`，失败日志 `/tmp/backtest-daily-engine-tests.log` 保留；首轮新增适配器类型错误已修正，原 `/tmp/backtest-daily-engine-types.log` 保留。

上述仍为 Domain 实际事件入口，不是正式保存、冻结 Worker、真实模型或目标部署证据；这些继续留在 T04d.5b／5c／6～8。三个合同及真实路由不变，未调用模型、Provider、业务数据库或同步脚本；未处理 ATR 失败。
## 日线委托正式保存与冻结 Worker 最小链

2026-11-17，T04d.5b。实际 `strategySchema` 接纳新日线执行分支，保留旧市价对象原值；校验主周期、来源、价格及阶段／父单引用。`RunConfigV3.dailyOrderMatching` 显式冻结四项政策，策略与运行配置交叉校验缺失或无效绑定。订单价格加入 `collectUsedSignalSources`、规则坐标／价格单位、指标及预热；常量明确按本次执行坐标解释、披露尺度依赖，不改变旧规则常量的转换要求。

Server 继续走 `runExchangeVertical` 与 `LocalSnapshotV3Runner`，冻结行情透传真实 high／low；旧模式缺字段的兼容输入不被新字段读取破坏。新模式的普通定仓一律读取下单收盘时可见价格／权益，移除未来开盘投影后冻结目标及资金；实际撮合只缩量。实际新建仍走现行三版定义及显式来源坐标，未增加生成合同版本。结果新增可选 `dailyOrders`，保留政策、订单终态、逐根成交、退出分配、共享额度、拒单及双触假设，参与完整结果校验和；旧结果无该字段。

`daily-order-worker.test.ts` 五例通过：配置绑定、两根限价两次按额度成交后到期、附属止损后取消建仓余量、按量／全成两种保护配合首单部分成交到期及 40% 分档退出。后两例已买 100、退出 40，按量余护 60，全成保护保持未启用。均使用独立行情／真实冻结产物，冻结后行情接口抛错，完整 Worker 结果重复严格相等。直接相关旧 `trade-plan-worker.test.ts` 一例保持通过。

`node scripts/test-ai-provider-postgres.mjs test/backtest/daily-order-postgres.integration.test.ts` 创建并清理独立 PostgreSQL 容器，53 份迁移；仅对独立 `ai_provider_concurrency_fixture` 写入。经 `StrategyCreationService` 正式保存两份新配置、数据库重读原样相等，再冻结、Worker／重复回放及配置中文通过。日志 `/tmp/backtest-daily-order-postgres.log`。真实业务库、历史决策、Provider 及路由未写入，模型调用为零。

新增持仓归属定向补测：实际账本已有 10 股可售 AAPL，新父单买 1 股尚未交收时保护等待；新份额交收后只卖 1，原 10 股保留。按父单已交收量分配退出，拆股同时重标归属单位，避免借用其他父单／周期或原持仓。`backtest-daily-order-ownership-tests.log` 中账本 7、纯撮合 10、原事件引擎 5 例通过；坐标／预热文件 11 例、中文 2 例通过。当前中文已区分委托触价和收盘保护、按量／全成、激活与首次可撮合时点、跨夜、触发价／成交价和运行单位；双端编辑及实际页面尚未完成。

验证日志：`/tmp/backtest-daily-canonical-schema-tests.log`（14 例）、`/tmp/backtest-daily-worker-stages-tests.log`（五个新 Worker 与一个旧对照）、`/tmp/backtest-daily-worker-ownership-tests.log`、`/tmp/backtest-daily-order-coordinates-tests.log`、`/tmp/backtest-daily-order-readback-tests.log`、`/tmp/backtest-daily-canonical-server-types-final.log`、`/tmp/backtest-daily-canonical-lint.log`、`/tmp/backtest-daily-canonical-boundaries.log`。失败日志 `/tmp/backtest-daily-worker-tests.log`（夹具误用旧规则的绝对阈值）及 `/tmp/backtest-daily-worker-tests-fixed.log`（新成交／订单字段与严格结果 Schema 不一致）均保留；分别修正独立夹具及事实序列化，不放宽旧规则或结果 Schema。

T04d.5c 继续补剩余冻结矩阵；T04d.6～8 的实际生成、双向编辑／页面和目标同步尚未验证，不据最小链路勾选父任务。不处理 ATR 失败，不新增真实 Provider 资格或更改原生模式。

## 11 月 19 日 ATR 编写成对复验

冻结与逐期更新两侧的本轮首次原生输出均通过，隔离保存及冻结快照重复回放一致。累计七组成对通过。11 月 16 日额外入场条件的原始失败与归因保留。[本轮配置、成交及实际请求](../archive/evidence/2026-11-19-backtest-atr-authoring-pair.md)
