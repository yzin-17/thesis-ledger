# 日线委托生成合同对齐与发现夹具修复

后续授权的 24 份实际模型复验见[独立证据](2026-11-17-backtest-daily-order-native-model-recheck.md)；下文“未调用模型”限定为本地合同修复阶段，原记录保持。

日期：2026-11-17，Asia/Shanghai。关联 [Spec](../specs/2026-11-15-backtest-trade-plans.md#配置与订单状态)、[Task](../archive/tasks/2026-11-15-backtest-trade-plans.md) T04d.6c／6d 及[原始捕获报告](2026-11-17-strategy-discovery-message-budget.md)。本次只实施用户确认的合同对齐与独立发现目标修复；保持三个 v5 合同和真实原生路由，未追加业务提示、调用模型、修改 Provider、同步运行态或处理原 ATR 失败样本。

## 原因与修复边界

只读核查显示，编写 `limit`、`touch`、`each-fill`、`full-fill`、`day` 五份完整输出没有普通退出模板，均通过当时出站 JSON Schema，却被最终 Zod 的必需模板校验拒绝。编写 `close` 给普通退出带父单，也通过原生结构后才被拒。Spec 本来就要求保留普通退出的委托方式；恒假退出不下单。修复保留该合同及原交易含义，没有替模型补单或根据摘要关闭退出。

发现的六份完整失败还含空字符串／证券代码作为十进制常量、未要求的指标及阶段、错误父单和有效期。其中三份本来就违反已发送的十进制格式，其余三份通过旧原生结构但未通过最终校验。额外规则仍属于模型误选，不能因本次修复而删除后记成功。新委托输出中出现的 ATR 阶段只作为该批原始失败事实，不重开先前 AC13 的 ATR 编写失败。

编写 `two-bars` 是 `length`／8192 输出 token 且缺少最终可解析 JSON；发现 `day` 没有完整响应，仍为结果未知。发现 `two-bars` 沿用同输入原失败的零调用复用证据。原原因与结果不重写为成功。

## 修改范围

- `packages/schemas/src/backtest-daily-orders.ts`：订单模板改为普通动作、阶段动作、附属止损、附属止盈四个严格结构分支。普通／阶段不接受父单或退出组，期限仅为 DAY／bars；止损为 stopMarket、止盈为 limit，均必填父单。保留原 TypeScript 数据形状和合法 JSON 原样解析。必需动作使用同一 `backtestRequiredOrderActions` 描述，最终数组检查继续执行。
- `packages/schemas/src/backtest-daily-order-result.ts`：结果事实直接复用独立动作 Schema，维持既有结果形状，不把模板分支的要求施加到成交结果记录。
- `apps/server/src/ai/ai-generation-json-schema.ts`：原生 draft-7 与文本 2020-12 共用投影，在订单数组用两项 `contains` 明确要求 entry／exit。四个组合分支来自共同 Zod，未在某一份请求里手工补 Schema。父单目标、阶段引用、重复动作、退出组配对、价格正值以及资金／持仓约束继续由最终校验和执行入口持有。
- `apps/server/test/backtest/daily-order-model.fixture.ts` 和 `daily-order-model-postgres.integration.test.ts`：独立意图夹具使用 `minClosedTrades: 0`，实际消息仍由正式准备入口装配。生产 `optimizationObjectiveSchema` 的缺省一笔不变，不修改实际实验或原捕获目标。该背景目标是否导致原模型擅加退出仍为推测。
- 新增订单组合与生成投影定向测试。没有修改发现、编写或共享日线委托业务提示的源码，也未改变生成额度、期限、执行引擎、数据库结构或依赖。

## 定向验证

以下命令均在主仓执行，使用共享 dirty `main`，HEAD 为 `1ed418780d1970e8380955453667edc2fed4b126`；开始时有 753 条工作区变更，不宣称干净提交或全仓绿色。

| 验证 | 结果 | 日志 |
| --- | --- | --- |
| `pnpm --filter @thesis-ledger/schemas exec vitest run test/backtest-daily-orders.test.ts test/backtest-daily-order-combinations.test.ts` | 29 例通过；合法模板原样往返，错误角色／父单／订单类型／有效期拒绝，既有引用和退出组校验保留 | `/tmp/backtest-daily-order-contract-schemas-20261117.log` |
| `pnpm --filter @thesis-ledger/server exec vitest run test/backtest/daily-order-generation-contract.test.ts` | 四例通过；发现、编写、修改的实际原生及文本投影均含组合与必需模板；实际发现消息携带零笔，生产缺省仍一笔 | `/tmp/backtest-daily-order-contract-projection-20261117.log` |
| `pnpm --filter @thesis-ledger/server exec vitest run test/backtest/daily-order-generation.test.ts test/backtest/daily-order-model.test.ts test/strategy-optimization/strategy-optimization-prompt-contract.test.ts -t '^(?!.*已知未通过)'` | 28 例通过；八份固定合同／Worker／完整回放／中文、实际保存前装配与修改范围、原生消息去重／完整 Schema 预算、SDK 内存传输桩通过；文本门槛在另一批执行 | `/tmp/backtest-daily-order-contract-entry-20261117.log` |
| `pnpm --filter @thesis-ledger/server exec vitest run test/ai/ai-native-strategy-schema.test.ts test/ai/ai-generation-schema-prompt.test.ts` | 11 例通过；已有原生／文本投影、元组、最终校验及固定解包保持 | `/tmp/backtest-daily-order-contract-ai-regression-20261117.log` |
| `pnpm --filter @thesis-ledger/schemas build`、`pnpm --filter @thesis-ledger/server typecheck` | 均退出 0 | `/tmp/backtest-daily-order-contract-build-20261117.log`、`/tmp/backtest-daily-order-contract-server-types-20261117.log` |
| 本次七个源码／测试文件的 `pnpm exec eslint` 与 `node scripts/check-boundaries.mjs` | 均退出 0 | `/tmp/backtest-daily-order-contract-lint-20261117.log`、`/tmp/backtest-daily-order-contract-boundaries-20261117.log` |
| 同一提示合同测试的 `-t '已知未通过'` | 一例失败：当前文本完整消息 **25,475 ≥ 16,000**；断言仍为正常失败，未提高门槛或删除检查 | `/tmp/backtest-daily-order-contract-text-gate-20261117.log` |

合计 72 例通过，文本已知门槛一例失败；不能报告全部测试绿色。原生发现消息继续低于原门槛，输入预留仍精确包含当前完整原生 Schema。上述 SDK 调用为内存传输桩，网络／模型调用为零。固定 Worker 验证不替代实际模型或部署验收。

## 原始输出的离线反例核对

读取以下三个既有目录中的原请求、出站 Schema、响应和最终 JSON，不写回原目录：

- `var/acceptance/backtest-daily-orders-discovery-native-20261117`
- `var/acceptance/backtest-daily-orders-authoring-native-a-20261117`
- `var/acceptance/backtest-daily-orders-authoring-native-b-20261117`

使用已安装 ESLint 依赖中的 Ajv 6.15.0，在内存编译捕获的旧 Schema 和当前正式 `generationOutput` 产生的新 Schema，并以当前最终 Zod 交叉核对。没有新增依赖或修改模型输出。13 份完整业务 JSON 的结果为：

| 原输出 | 旧原生 Schema | 当前原生 Schema | 当前最终校验 |
| --- | --- | --- | --- |
| 发现 `limit`、`market`、`close` | 三份均拒绝 | 三份均拒绝 | 三份均拒绝 |
| 发现 `touch`、`each-fill`、`full-fill` | 三份均通过 | 三份均拒绝 | 三份均拒绝 |
| 编写五份缺普通退出模板 | 五份均通过 | 五份均拒绝 | 五份均拒绝 |
| 编写 `close` 的普通退出父单 | 通过 | 拒绝 | 拒绝 |
| 编写 `market` 原成功输出 | 通过 | 通过 | 通过 |

因此九份“原生结构接受、最终拒绝”的反例现在会在生成 Schema 中受约束；原十二份失败仍失败，原成功市价配置仍可接受。这是合同对齐的离线证据，不是九份新模型成功，也不证明任意跨字段规则已全部投影。

三个目录的 108 份原始 JSON 文件在修改前后按目录顺序计算 SHA-256，汇总值相同：`a17041145c0a120e314392860567672dff506c6801b6508c209d23b37a8fc4d0`。三个业务提示源码前后哈希也相同：

| 文件 | SHA-256 |
| --- | --- |
| `apps/server/src/strategy-authoring/authoring-prompt.ts` | `ebb78f6f2cb9c8164ade3a906f482272d2a9225cef872c453c1c6376cc35060f` |
| `apps/server/src/strategy-optimization/strategy-optimization-discovery.ts` | `7f7bb8b0b8cbb61ac52ccfeb6f028645488d82dee15c4dce879ed47a70a3b2e9` |
| `packages/domain/src/backtest-daily-order-prompt.ts` | `9fb35e66903c76c58f106ec7c7a61ac238521ab80d6222da1546eb14b3fc1ffc` |

文本模式中的自动生成 Schema 随合同变化；没有追加业务提醒、例子或针对某个失败样本的提示。

## 当前验收边界

T04d.6c／6d 的本地合同与夹具修复完成。原始捕获使用旧 Schema 和旧目标，原“当前合同与捕获相同”的复核只属于原去重基线；本次更新后不能继续用它证明新投影的实际生成成功。LMStudio 对新增约束的实际处理和模型是否选对仍未复验；保持 T04d.6b 未勾选。文本门槛失败、模型误选、截断、未知结果及 T04d 其他未完成项继续由 Task 持有，原 ATR 失败样本保持封存。
