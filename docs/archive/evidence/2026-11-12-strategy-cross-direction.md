# AI 策略交叉方向修复验收

关联规格：[交叉方向一致性](../../specs/2026-11-12-strategy-cross-direction.md)。完成状态见[归档任务](../tasks/2026-11-12-strategy-cross-direction.md)。日期按 Asia/Shanghai 记录；接口原值与冻结记录保留原时区。

## 根因与责任边界

目标策略为「腾讯控股EMA趋势跟踪」，策略 ID `55f66224-9c77-4773-99c0-630850b47a7d`。

- 最早可核验的 AI 成功结果：AiRun `dfc947b3-b2e6-4c1e-aff3-71d128bafcd0`，promptVersion=`strategy-optimization-v1`，模型 `lmstudio:qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive@q4_k_m`。
- 探索实验 `71bbc0a2-89ae-48eb-938f-0b7e534aecb2` 的候选 `b2c66f27-2238-4ffe-b16e-4601ae0e461f`、采用后的 v1 `e0137741-0f5d-4da1-808b-8eb8852717b8` 均保留相同方向：entry.left=EMA、right=收盘价、above；exit 使用相同左右项及 below。
- 同一结果的说明却为价格上穿均线建多、下穿均线平仓。SDK 装配保留 entry/exit，版本保存也未交换左右项；因此可确认错误已出现在 AI 生成的持久化结果中，不能归咎于图表标记或版本保存。
- 求值器按左侧穿越右侧计算：above 为前一 left<=right 且当前 left>right，below 为相反方向。原规则实际为价格跌破 EMA 买入、涨回 EMA 卖出。引擎执行与已保存定义一致。
- 生成提示只列方向枚举，未定义主语与数学条件；结构校验允许两种合法 AST，却没有说明／确认摘要与 AST 的交叉一致性检查。这是本次补齐的系统缺口；不能据此声称已知道模型内部的出错机制。

## 修复内容及适用范围

- `packages/schemas/src/strategy-cross-semantics.ts` 维护共用交叉提示与明确中文价格均线陈述检查；共享方向字段也携带数学语义。
- 完整探索、SDK 精简探索与自然语言编写均提供左右主语、价格上穿／下穿 EMA 示例和交换等价规则。优化提示记录版本更新为 `strategy-optimization-v2`，编写提示更新为 `authoring-prompt-v8`。
- 探索在生成边界拒绝反向陈述，返回 `STRATEGY_SIGNAL_SEMANTIC_MISMATCH`；编写另外核对用户确认的 entrySummary/exitSummary，沿用 `AUTHORING_SEMANTIC_MISMATCH`。局部修改复用编写检查。
- 校验保留说明一致的逆势策略，不修改模型结果；多个可匹配交叉、否定、不同来源或无法确定主语时不猜测。它不是任意自然语言与复合规则等价的证明。
- 没有新增跨 feature 反向依赖，两个业务消费者只消费 schemas 拥有的策略表达合同，边界门禁通过。

## 新版本及对照回测

通过正式 `POST /api/v1/backtests/strategies/:id/versions` 新增 v2：`3bfad50a-153d-49ea-94bc-c04ded96945a`。仅交换 entry、exit 的左右操作数；EMA20、50% 权益仓位、3% 固定止损、10 周期上限、费用、执行、描述和来源保持不变。新版本来源为人工确定性纠错，未冒充新的 AI 生成调用，也未重新请求 AI。

使用原 RunConfig 与冻结行情引用，重绑定新版本指纹后由正式回测接口重新执行全部服务端准备校验并提交队列。没有绕过准备门禁或直接写入任务终态。

| 项目 | 原 v1 | 修正 v2 |
| --- | --- | --- |
| 回测 ID | `a20a39e3-620e-4fb0-ad31-14b6dfa91758` | `ec5dd526-7083-4697-980a-3c209ca91dce` |
| 窗口 | 2025-11-12 至 2026-11-12 | 相同 |
| 模拟收益率 | -7.36694% | -17.51266% |
| 最大回撤幅度 | 11.18381% | 17.51266% |
| 已平仓交易 | 15 | 14 |
| 买卖成交标记 | 30 | 29（15 买、14 卖） |
| 已平仓平均持有交易日 | 4.8667 | 3.4286 |
| 信号退出／风险退出 | 7／8 | 8／6 |
| 胜率 | 46.6667% | 7.1429% |

新回测已保存 succeeded；期末仍有一笔持仓，收益包含期末估值。修正方向后频率未明显降低、表现更差，不能把方向修复当作策略有效性证明，也未额外优化参数。

### 冻结输入与逐笔核验

- 两次 RunConfig 完全一致，`frozenExecutionWindow` 完全一致，可比数据指纹均为 `bf8e43d6bd205706d30606ad267f85855fd002f399549659dc1649ccf5dc8237`。
- 经 Snapshot Store replay 完整性检查后读取两次 execution/bars，282 根日线（含预热）逐行一致；执行区间各 247 个权益时点。
- 独立按首 20 根收盘均值初始化、alpha=2/21 递推 EMA，检查成交前一根日线的价格与 EMA 差值。该核验使用浮点近似，只作方向交叉复核，不改写任何业务金额和精度。
- v2 全部 23 次信号成交方向通过；全部 29 笔成交价与对应冻结日线开盘价相符，成交都位于信号后的下一根行情。6 笔风险退出中，4 笔满足固定止损、2 笔达到 10 周期上限。
- 首次买入：2025-12-12 信号，价格减 EMA 从 -78.221410 变为 +0.390151，2025-12-15 开盘成交。随后 2025-12-15 差值变为 -63.447333，2025-12-16 开盘卖出。这个真实例子同时说明方向已正确、交叉仍可能在相邻交易日反复出现。

### 历史保护

维护脚本在操作前后只读核对原策略行、所有既有版本、所有既有回测，以及关联实验、候选、尝试和 AiRun。仅把新增版本／任务排除出旧记录比较，未忽略已有字段变化。四组摘要逐项相同：

| 原记录集合 | 操作前后共同 SHA-256 |
| --- | --- |
| 策略 | `c226a32b1580920869f86436fd0cf7817a799cc2c4ffb78dc11ccc90d030c459` |
| 既有版本 | `074060ce5187dbfb4743cf64ea64bb7d2eefcd2ff9ef5d80604cd51d0ea2dd8f` |
| 既有回测 | `2eb24d9a2d48c1b9cd0af1c3cfa0673eefba243c9ccd26f42f8412ffc18b3727` |
| 关联实验、候选、尝试、AI | `8de79f4c77dce50860aa87f22df3dd2c883c5936fb66a966859a5919034276db` |

## 检查与运行证据

- schemas 包测试：147 文件、1597 测试通过；后续主语歧义收敛后定向交叉语义测试 7 项再次通过，包 build 通过。
- 最终生成相关回归：`pnpm --filter @thesis-ledger/server exec vitest run test/strategy-authoring test/strategy-optimization`：47 文件通过、19 跳过；249 测试通过、99 跳过。跳过项未作为隔离 PostgreSQL 通过证据。
- `node --test scripts/local-runtime/strategy-cross-repair.test.mjs`：2 项通过，验证只交换授权项、保持输入不变及拒绝无明确修复依据。
- 修改的 TypeScript 文件定向 ESLint 通过；两个本地运行 mjs 文件被仓库 ESLint 配置忽略，另由 Node 测试验证。`check-boundaries.mjs` 通过；文件尺寸检查报告 5 个存量警告、无本次新增超限。
- 全量 Server 测试：552 文件通过、7 文件失败、109 跳过；4384 测试通过、12 失败、505 跳过。包含 Arena 时间线夹具、数据库 migration head／列表断言和回测用例失败；共享工作区有同期修改，未通过回滚他人代码构造纯净基线，也不宣称全量通过。定向范围以本节最终结果为准。
- 第二轮构建曾遇到共享 dist 并发清理的 ENOTEMPTY；停止同输入重试，确认构建结束后成功。随后共享工作区的 MarketController 重构出现两处函数调用前多余分号，已作两行调用语法修正，保留其他改动；6 个 MarketController 消费测试文件、59 项测试及 Server typecheck 通过。
- 第一次正式快更：执行目录 `thesis-ledger-infra`，入口 `./scripts/sync-code.sh thesis-ledger`，退出 0；Server／Worker 均 healthy，镜像保持不变。容器内直接用原 v1 生成定义调用新校验，确认拒绝并返回两个方向问题。
- 提示版本号补记后的第二次快更因上述 MarketController 编译错误退出 1，未到容器替换阶段；修复并定向验证后再次执行相同目录和入口，退出 0，Server／Worker 均 healthy、镜像 ID 不变。
- 最终独立运行校验：Server 和 Worker 均读到优化提示 `strategy-optimization-v2`、编写提示 `authoring-prompt-v8`；正式 API 同时可读 v1、v2，两个回测均 succeeded。原结果摘要 `36b412846d830f51`、新结果摘要 `90799e6107ec883e`，可比指纹仍相同；只涉及提示来源版本号的最后修改没有改变回测执行器或输入，不重复生成任务。
- 最终边界检查通过。全工作区 `git diff --check` 仍报告 6 个同期文件的尾部空行；未为本次任务清理其他任务的整片工作区。交叉修复自身文件的定向差异检查另行通过。

可重复入口（默认只预览，`--apply` 明确新增；复用已存在的相同修正版和幂等回测）：

```sh
node scripts/local-runtime/strategy-cross-repair.mjs \
  --strategy-id 55f66224-9c77-4773-99c0-630850b47a7d \
  --source-version-id e0137741-0f5d-4da1-808b-8eb8852717b8 \
  --source-run-id a20a39e3-620e-4fb0-ad31-14b6dfa91758 \
  --output /tmp/strategy-cross-repair-new-receipt.json --apply
```

本次原报告：`/tmp/strategy-cross-repair-preview-20261112.json`、`/tmp/strategy-cross-repair-applied-20261112.json`。报告本身不代替数据库原记录或最终运行态校验。

## 验证边界

原样保留的警告：上市日期未知、公共收费源暂不可用、停复牌来源暂不可用。新旧对照采用同一研究假设，不能据此确认真实费用、真实可成交性或来源恢复。未新增外部 AI 调用，未修改前端、未写入交易账本、未构建生产镜像、未提交或推送 Git。快更只更新容器可写层，重建后需重新同步。
