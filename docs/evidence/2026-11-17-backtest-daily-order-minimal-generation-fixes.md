# 日线委托生成的两项最小修复证据

## 范围与结论

本次按用户确认，只修改 T04d 的必需模板生成结构和委托直接常量价格。共享脏工作区为 `main`，开始时 757 条状态记录；保留其他任务修改，不暂存、提交或同步。三个策略用途仍为 v5；没有调用模型、探针、数据库或真实 Provider 保存流程，没有追加业务提示或处理 ATR 样本。

本地 84 个定向检查通过，另一个既有文本消息门槛检查失败：当前 **27,708 ≥ 16,000**，上限和正常失败断言保持。原始 24 份模型记录只做离线核对；测试通过表示预期的接受／拒绝正确，不表示模型生成成功。真实原生后端是否遵守新槽位仍未重新验证；正则穿透问题另留待查。

Spec 和 Task 分别见[规格](../specs/2026-11-15-backtest-trade-plans.md#配置与订单状态)、[实施任务](../archive/tasks/2026-11-15-backtest-trade-plans.md)。上一轮模型原判定见[原生模型复验](2026-11-17-backtest-daily-order-native-model-recheck.md)，此前合同修复与旧反例见[原合同证据](2026-11-17-backtest-daily-order-generation-contract.md)，均未改写。

## 两项实现

1. 新生成的可编辑委托固定前两项为建仓、普通退出；余项只接受阶段／止损／止盈。`generationJsonSchema` 对共享数组的必需动作约束先作内部定位，再在返回前展开为原生 draft-7 的元组 `items` 与 `additionalItems`；实际返回参数中没有 `contains`。文本 draft-2020-12 使用相同槽位含义的 `prefixItems` 与 `items`。既有严格角色分支、价格表达式引用、期限和父单要求保留。
2. 委托价格表达式根部的常量直接使用 `positiveDecimalStringSchema`，作为结构约束进入原生 Schema；序列、指标等其他分支保持，一般数值常量仍允许零和负数。所有价格保持十进制字符串，不转浮点、不截断精度。指标输入仍使用通用数值合同，实际求值价格继续在下单时检查。

生成排序限制没有写入持久化数组合同。保存／读取不自动重排或补单；局部修改范围外的执行结构仍使用原值冻结。专门验证了“普通退出、建仓”的历史顺序被冻结保留，以及成功历史配置“建仓、止损、普通退出”仍原样读取。普通退出恒假条件仍可使用零常量。

涉及源码：

- `packages/schemas/src/backtest-expression.ts`、`backtest-daily-orders.ts`：委托价格的专用根常量分支。
- `apps/server/src/ai/ai-generation-json-schema.ts`、`ai-generation-order-slots.ts`：三入口共用生成槽位投影。
- `packages/schemas/test/backtest-daily-order-combinations.test.ts`：价格合法性、通用数值兼容和精度反例。
- `apps/server/test/backtest/daily-order-generation-contract.test.ts`：发现／编写／修改的原生引用、原生内联及文本投影，历史冻结顺序。
- `apps/server/test/backtest/daily-order-generation-captures.test.ts`：显式私有捕获目录下的只读离线核对；没有网络或业务写入。

## 原始捕获逐类核对

输入为 `var/acceptance/backtest-daily-orders-contract-{discovery,authoring,modification}-{a,b}-20261117` 中原始 wire、原始输出、操作输入和原回执。用已安装 ESLint 依赖中的 Ajv 编译当时实际发送的 Schema 与当前正式 `generationOutput` 的 Schema，再以当前最终 Zod 校验交叉核对。未编辑任何模型配置。

23 份完整 JSON 中，原捕获 Schema 接受 15 份，当前生成投影接受 12 份，当前最终合同接受 11 份。减少的三份为：零价委托、合法但误选的发现配置的旧顺序、成功编写配置的旧顺序；不能把这三个不同原因混为模型理解改善。

| 原始输入 | 当前生成投影 | 最终合同／历史判定 |
| --- | --- | --- |
| 发现 `limit`／`market`／`touch`／`close`／`each-fill`／`full-fill`，编写 `day`，共七份缺普通退出模板 | 拒绝；现在固定第二槽位表达该要求，旧标准 Schema 也已拒绝这些原样 JSON | 仍拒绝；不据摘要补退出单，尚未证明真实后端执行新槽位 |
| 发现 `day` | 仍拒绝原来的非十进制常量等错误 | 原失败保留，正则穿透另留待查，未扩展修复 |
| 编写 `close` 的普通退出 stopMarket 价格 `"0"` | 原投影接受，当前投影拒绝 | 最终合同一直拒绝；本次补上静态生成约束 |
| 编写 `touch`／`each-fill` 的单腿退出组 | 仍通过生成投影 | 仍由最终 OCO 配对校验拒绝；不补止盈或删组 |
| 编写 `full-fill` 的 low 依赖未在来源声明 | 仍通过生成投影 | 仍由来源字段校验拒绝；不改来源或价格表达式 |
| 发现 `two-bars` | 因“建仓、止损、退出”的旧顺序被当前生成投影拒绝 | 最终合同仍允许原结构；原合法结构误选及冻结价格证据拒绝保持，不能记作引擎偏差或模型成功 |
| 修改八份，编写 `market`，共九份原成功配置 | 通过当前投影和最终合同 | 原配置不变，原成功证据保留 |
| 编写 `two-bars` 的原成功配置 | 因“建仓、止损、退出”的旧顺序被当前生成投影拒绝 | 最终合同、配置读取及原值比较通过；历史成功不撤销，不替它重新排列 |
| 编写 `limit` | 没有最终 JSON，未参与 Schema 编译校验 | 第 24 项仅核对原截断记录，保留原失败，不构造配置 |

原成功的十份配置均通过当前策略读取，当前编写／修改输出解包后与原保存配置深比较相同。执行、回放与中文实现没有改动，十份原执行／回放／中文及 132 张页面的证据按原输入复用，本次没有重新运行 Worker、截图或部署。此次离线检查不能代替下一轮模型或目标运行态验收。

## 定向验证

命令在仓库根目录运行，Shell 通过 `rtk proxy` 调用。测试计数按唯一检查计算，后续内联投影补测不重复累计。

| 命令或过程 | 结果 |
| --- | --- |
| `pnpm --filter @thesis-ledger/schemas exec vitest run test/backtest-daily-orders.test.ts test/backtest-daily-order-combinations.test.ts` | 37 例通过：原 29 例与新增八例价格／通用数值／精度检查 |
| `pnpm --filter @thesis-ledger/server exec vitest run test/backtest/daily-order-generation-contract.test.ts` | 五例通过，最终日志 `/tmp/backtest-daily-order-minimal-slots-20261117.log`；三入口各验证原生引用、内联及文本，无 contains；冻结旧顺序与生产默认目标保留 |
| `pnpm --filter @thesis-ledger/server exec vitest run test/ai/ai-native-strategy-schema.test.ts test/ai/ai-generation-schema-prompt.test.ts` | 十一例通过；与首轮槽位测试同批，工具回执留存；固定解包、最终校验及元组长度未变 |
| `BACKTEST_DAILY_ORDER_CAPTURE_ROOT=/Users/yzin/code/thesis-ledger-workspace/thesis-ledger/var/acceptance pnpm --filter @thesis-ledger/server exec vitest run test/backtest/daily-order-generation-captures.test.ts` | 24 项通过，含 23 份完整 JSON 和一份截断事实；最终日志 `/tmp/backtest-daily-order-minimal-captures-final-20261117.log` |
| `pnpm --filter @thesis-ledger/server exec vitest run test/backtest/daily-order-generation.test.ts test/strategy-optimization/strategy-optimization-prompt-contract.test.ts -t '原生探索实际消息\|文本模式保留完整合同\|原生实际SDK请求\|发现实际装配\|编写只确认\|完整确认模板\|确认草稿'` | 七例通过，五例未选中、不计通过；正式装配、确认／范围、原生去重、完整 Schema 预算及 SDK 内存请求桩。日志 `/tmp/backtest-daily-order-minimal-entry-20261117.log` |
| 上述提示合同测试单独 `-t '已知未通过'` | 一例失败：27,708 不小于 16,000；另七例未选中，日志 `/tmp/backtest-daily-order-minimal-text-gate-20261117.log`。前值 25,475 保留在旧证据，不放宽门槛 |
| `pnpm --filter @thesis-ledger/schemas build`、`pnpm --filter @thesis-ledger/server typecheck` | 均退出 0；最终类型日志 `/tmp/backtest-daily-order-minimal-types-final-20261117.log` |
| 本次七个源码／测试文件的 `pnpm exec eslint`、`node scripts/check-boundaries.mjs` | 均退出 0，日志分别为 `/tmp/backtest-daily-order-minimal-lint-final-20261117.log`、`/tmp/backtest-daily-order-minimal-boundaries-20261117.log` |

实施中的首次 Server 类型检查指出 JSON Schema 的布尔分支与测试数据需显式收窄，已局部修正并通过复查；没有降低类型检查。默认不提供私有捕获目录时，捕获文件检查不执行；上表实际运行显式传入目录，24 项全部执行，不以跳过代替验收。

## 证据保留与边界

六个本轮捕获目录共 211 份 JSON，前后聚合 SHA256 均为 `d101a1442d0d56afce6fee01a1d8bc41ab639b745e9ca6556ca5c0b2b57463a7`。更早的发现／编写原生三个目录递归 111 份 JSON 仍为 `7fc0cabafde7801788ba94188a154ffa7d90799ff76ab01a81ca79e609b4e3cc`。算法均为按仓库相对路径排序，将路径、NUL、文件原字节依次输入 SHA256；递归 111 与早期仅顶层 108 的统计不混用。

业务提示文件哈希与此前记录相同：

| 文件 | SHA256 |
| --- | --- |
| `apps/server/src/strategy-authoring/authoring-prompt.ts` | `ebb78f6f2cb9c8164ade3a906f482272d2a9225cef872c453c1c6376cc35060f` |
| `apps/server/src/strategy-optimization/strategy-optimization-discovery.ts` | `7f7bb8b0b8cbb61ac52ccfeb6f028645488d82dee15c4dce879ed47a70a3b2e9` |
| `packages/domain/src/backtest-daily-order-prompt.ts` | `9fb35e66903c76c58f106ec7c7a61ac238521ab80d6222da1546eb14b3fc1ffc` |

一致性复核：本次静态生成约束完成；最终引用校验和持久化兼容保持；没有模型重跑或运行态同步。T04d.6b 的真实发现／编写生成缺口、正则穿透待查、文本门槛、T04d.5c／7／8 及其他原未完成项继续由 Task 持有。ATR 原失败与归因不变，本次不处理。
