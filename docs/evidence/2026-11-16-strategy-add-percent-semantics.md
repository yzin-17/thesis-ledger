# 加仓百分比修复验收证据

## 结论与根因

旧真实响应在 reason 中写“浮盈达到 0.5%”，却选择 `gainPercent.value="0.5"`。项目定义该字段为比率，执行器和回读均按 50% 处理。原生成 Schema 缺少字段级单位及小于 1% 的例子，通用“小数串”提示不足；结构校验也不能区分合法 50% 与错误转换的 0.5%。

本次在生成 Schema 及共用提示中明确 `0.5%=0.005`、`50%=0.5`，区分首次数量比例、权益比例与 ATR 倍数；普通编写对照确认原文，计划局部修改对照本次意图，实验发现对照当前说明，实验候选保存前再次检查。明确单个加仓阈值矛盾时拒绝，不改写模型输出或历史值。人工审核保存以当前定义为准，非计划局部修改仍有原有范围约束，不让旧需求覆盖已经确认的计划修改。

## 定向验证

执行目录：`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger`。

- Schema 语义及原生生成 Schema 测试 18 项通过，含旧百倍错误、真实新输出所用“持仓收益”表达、合法 50%、高精度、ATR、其他基准和歧义。
- Server 五个定向文件共 48 项通过：编写、局部修改、发现生成与候选保存、旧真实失败原始响应回归；当前审核和保存保留确认后的计划，非计划修改不能附带更改阈值。
- Schema／Domain／Server 构建、Server `tsc --noEmit`、定向 ESLint、`node scripts/check-boundaries.mjs` 通过。
- 零模型调用预检 `add-percent-preflight-20261116`：17 笔买入、6 次加仓、预算及复跑检查通过。

```sh
rtk proxy pnpm --filter @thesis-ledger/schemas exec vitest run test/strategy-add-gain-semantics.test.ts
rtk proxy env INVESTMENT_AI_DIRECTORY=/Users/yzin/code/thesis-ledger-workspace/thesis-ledger/var/acceptance/investment-budget-real-ai-20261115 pnpm --filter @thesis-ledger/server exec vitest run test/strategy-authoring/authoring-add-percent.test.ts test/strategy-optimization/strategy-discovery-add-percent.test.ts test/strategy-authoring/authoring-semantics.test.ts test/strategy-authoring/authoring-modification.test.ts test/strategy-optimization/strategy-optimization-discovery.test.ts
```

## 真实模型与冻结回放

沿用 `lmstudio` 的 `qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive@q4_k_m`。仅一次真实调用，300 秒总墙，无自动重试。当前源码为 v5，因此直接使用修复后的当前 Schema 和提示；本次未启用旧 Schema 锁定，未更改 Provider 或路由。请求中的自然语言要求未提示配置字段名；独立核对模型原始输出，未做人工修正。

```sh
rtk proxy env INVESTMENT_AI_DIRECTORY=/Users/yzin/code/thesis-ledger-workspace/thesis-ledger/var/acceptance/investment-budget-real-ai-20261115 INVESTMENT_AI_DEPLOYED_SCHEMA=0 INVESTMENT_AI_LIVE=1 INVESTMENT_AI_CASES=add INVESTMENT_AI_TIMEOUT_MS=300000 INVESTMENT_AI_LABEL=add-percent-live-20261116 AI_PROVIDER_TEST_TIMEOUT_MS=900000 node scripts/test-ai-provider-postgres.mjs test/backtest/investment-budget-model.integration.test.ts
```

仓库隔离 PostgreSQL 入口应用完整 53 个 migration，使用正式生成、候选保存及 V3 Runner 服务；新记录导出后清理隔离容器。`receipt.json` 记录一次调用和通过结果。AiRun 成功，提示版本 `strategy-optimization-v12`，合同 `strategy-discovery-v5`。`request-1.json` 留存实际发送的 Schema，确认包含 `0.005` 单位说明。

| 对象 | 新记录 |
| --- | --- |
| 实验 | `abbf969d-5c77-4810-9389-3def63fd4ddd` |
| AiRun | `e9d1fbee-bb95-4241-8cea-41548f3e016d` |
| 候选 | `688af799-19f7-4bb0-b142-f32abf56697d` |
| 策略版本 | `d2ddf504-3182-4b90-a6cc-18a0069ed35a` |
| 回测 | `bab2ba9c-cf36-4480-9465-d6bc3e19486a` |

模型原输出：收盘价上穿 EMA20，首次投入 20%，上涨 `0.005` 即 0.5% 后追加首次数量的 100%，总投入上限 30%，单轮一次，持有 10 根退出。保存值与模型装配结果一致。282 行行情逐行相同，来源 Run 为 `9c7efea9-9242-494b-8bec-cef825ed4b1d`。

- 行情摘要：`f63e1d7fbe5895acf0d63c1fb9e743b352fb902df5f20e0987fc39d2e8930c47`。
- 可比输入指纹：`8bd11e820a65fd17839451ff6dc5c707866268e020124e6392d9872df5c136cb`。
- 结果校验和：`2f5ca289b831e54f`；完整 Runner 复跑结果完全一致。
- 27 笔成交，17 笔买入，其中实际加仓 6 次。逐笔独立重建执行前现金、原开盘价下持仓占用与权益，含 1% 正滑点、0.1% 佣金及最低 HK$10。
- 首次买入总支出不超过权益 20%；加仓时已有持仓占用加本次含滑点成交额、全部费用不超过权益 30%，现金不透支。17 笔均严格通过，不使用容忍误差；最小剩余额度 `3.061011297968e-39` HKD。
- 另用 Python Decimal 的 1000 位精度，从全部 27 笔成交独立重建现金及持仓，不调用项目十进制或仓位实现；再次核对 17 笔买入、6 次加仓，正滑点、正费用、现金及持仓均通过。独立报告为 `decimal-independent-verification.json`。

首笔实际加仓为北京时间 2026-04-21 09:30：执行前权益约 HK$93,668.13，已有持仓占用约 HK$18,877.61，本次含滑点成交及费用约 HK$9,222.83，合计不超过 30% 上限约 HK$28,100.44。金额仅作展示舍入，严格判定使用逐笔报告中的完整十进制值。

私有完整记录在 `var/acceptance/investment-budget-real-ai-20261115/add-percent-live-20261116/`：`response-1.json` 为模型原响应，`records.json` 为隔离数据库导出，`add-configuration.json`、`add-audit.json` 和 `add-snapshot/` 为配置、逐笔核对及完整冻结输入。

## 运行态与历史保留

本地 Server／Worker 正式快更及最终只读验证均通过。最终入口在 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行 `rtk proxy ./scripts/sync-code.sh thesis-ledger`，退出 0；全部兼容及构建预检通过，目标服务健康，镜像 ID 不变，仅容器可写层更新。容器重建后恢复镜像代码，本结论不是镜像发布证明。

正式入口为相邻 infra 目录的 `rtk proxy ./scripts/sync-code.sh thesis-ledger`。第一次退出 0，更新 Server／Worker；补充非计划局部修改边界后，同一入口在载荷构建阶段被并行修改的 `backtest-v3-benchmark-identity.ts` 类型错误拦截，退出 1，未写入容器。原调用链已有 K 线来源检查，在身份函数补充同一不变量，不回退冻结周期来源的新行为；4 个基准文件的 29 项测试、Server 类型检查及该文件 ESLint 通过。另一次入口遇并发维护锁时退出 1，未绕过或删除锁；锁释放后继续使用正式入口。

初次只读验证 `runtime-verification.json` 保留为失败事实：提示版本号被并行改动恢复为旧值，验证脚本还使用了不匹配实际提示文案的字面断言和错误的 authoring 版本前缀。修复提示版本并校正验证判据后，正式快更再次退出 0。最终脚本 `add-percent-live-20261116/verify-runtime.cjs` 和结果 `runtime-verification-final.json` 保留实际解析的 pnpm 包路径及 12 个模块摘要，两容器均与宿主最终产物相同：Schema 单位说明、共用提示、新语义检查、普通生成／修改／保存、实验发现／候选保存、日期锚点及基准来源检查均覆盖。原生 Schema 含 `0.005`，纯函数实测拒绝明确百倍错误，正确 0.5% 和合法 50% 均通过；提示版本分别为 `authoring-prompt-v24` 与 `strategy-optimization-v12`。提示相关定向 12 项通过，其中 11 项复用同一发现测试集合。

```sh
rtk proxy node var/acceptance/investment-budget-real-ai-20261115/add-percent-live-20261116/verify-runtime.cjs
rtk proxy node scripts/local-runtime/verify-investment-history.mjs var/acceptance/investment-budget-real-ai-20261115 history-verification-after-add-percent-runtime.json
```

以上两项退出 0。原策略、6 个版本及 14 条回测在修复后及运行态更新后的两次报告中均逐项一致。宿主变更保持未提交，未暂存或覆盖原工作区改动。

历史五次模型尝试、原阈值错误及诊断记录完整保留。风险预算及目标波动率复用此前已通过的真实证据，没有重复请求。至此三类真实模型及资金上限验收均已有通过证据；本结论不认证产品 HTTP／队列、三段绩效优选或投资收益有效性。

## 最终复查

没有改动执行器、投入上限、数据库结构或旧记录。语义检查保守处理明确单一阈值，多阶段及歧义不自动映射；合法 50% 和 ATR 倍数保持原义。旧真实失败样本依然原值 `0.5`，在修复后的正式生成装配入口被拒绝；新真实响应为 `0.005`，实际加仓及资金约束由同一冻结 Runner 验证。

AC1—AC5 均有对应证据；本地运行态校验额外通过。最终复查覆盖生成与修改的原文归属、候选保存防线、已确认人工编辑兼容、实际费用和滑点、冻结摘要、原记录保留及隔离／产品入口边界，无未解决问题。两项完成任务归档，需求 Spec 保留为现行语义及验收合同，证据由两项任务与现行合同共同引用。
