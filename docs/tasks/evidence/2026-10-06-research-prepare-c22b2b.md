# 保存真实股票输入的 Server 准备验收

开始日期：2026-10-06；收口日期：2026-10-07。对应 [C2.2b2b](../../archive/tasks/2026-10-03-multi-source-remaining-acceptance.md)、[普通研究窗口规格](../../specs/2026-10-03-multi-source-remaining-acceptance.md#research-window-policy)。本叶本地准备与冻结语义通过，未更新目标运行态。

## 已验证的结果

沿用 [b2a 保存输入](2026-10-06-research-listing-c22b2a-input.json)：600000.SH 与 600519.SH 的腾讯 qfq 请求均为 2023-07-08～09-15，共 50 根实际保存行情。运行窗口 08-01～09-15 有 34 根，运行前有 16 根；候选预热预算为五日，测试策略使用 MA5。

两只股票经实际 `BacktestRunPreparationService.prepare` 得到 `prepared`，执行预检为 `ready`。所选来源、原行情输入指纹与显式研究模型保持，冻结引用及五日预算写入返回配置。600000.SH 原上市事实沿用，600519.SH 的上市信息保持 `{ symbol: '600519.SH', status: 'unknown' }`，日级信息保持 `{ status: 'unknown' }`。

准备实际调用 `MarketBarWindowReaderV3`、`MarketWindowEvidenceV3Repository` 与冻结 Reader；数据库和路由是受控端口，读取／规范编码／证据一致性及冻结派生算法执行项目真实实现。每个样本只有一次行情获取，随后禁止新取价仍能用冻结引用组装完整本地 Snapshot，实际写入并读取 Parquet。完整性为 `complete`，再调用 Builder 和 Snapshot 重放保持相同 manifest，费用不重复读取，不创建真实 BacktestJob。

另用同一五日预算和 MA3 验证冻结子窗：父窗仍为 50 根，子窗从 07-12 开始，有 48 根。准备调用 Reader 两次但行情获取仅一次，子窗保留未知上市信息。修改冻结父数据后校验失败，未补发取价；超预算的 MA60、2099 年来源观测时间和标的失配均阻断准备。

## 日历与收费输入

[保存依赖](2026-10-06-research-prepare-c22b2b-dependencies.json)由当前 DSA 的实际离线函数生成：`calendar_fact` 返回已核验来源的 `exchange-calendars` 日历，覆盖 2023-07-08～10-02；`instrument_facts_response(identity_only=True)` 返回标准股票规则事实。它们用于已保存行情的本地语义验证，不表示新在线 Provider 读取或目标数据库验收。标准规则事实的时间没有作为上市日期使用。

测试中的执行模型来自既有显式研究模型夹具，按两只股票及本次窗口配置，保留非零佣金、印花税等费用设置；模型来源仍为研究假设。当前 DSA `OfficialPublicFeeProvider.read` 实际核对主备包，对两只股票的整个运行窗口都返回 `insufficient_coverage`。Snapshot 收费组合逻辑实际尝试两个来源后冻结 `executionModel` 兜底说明，读取费用产物时再次验证模型身份；模型对象与 contentHash 保持。该结果不将模型收费称为历史真实费率。

依赖生成脚本：[本地脚本](/private/tmp/thesis-c22b2b-dependencies.py)。价格和费用原文均不外推到其覆盖范围之外；日历在本地已冻结到后续结算候选范围。

## 验证

```sh
cd /Users/yzin/code/thesis-ledger-workspace/thesis-ledger
rtk proxy pnpm --filter @thesis-ledger/server exec vitest run test/backtest/v3-captured-research-preparation.test.ts test/backtest/backtest-run-preparation.test.ts test/backtest/v3-unknown-listing.test.ts test/market/market-frozen-window-reader-v3.test.ts test/backtest/public-fees-snapshot-v3.test.ts
rtk proxy pnpm --filter @thesis-ledger/server typecheck
rtk proxy pnpm --filter @thesis-ledger/server build
rtk proxy pnpm exec eslint apps/server/test/backtest/v3-captured-research-fixtures.ts apps/server/test/backtest/v3-captured-research-preparation.test.ts --rule 'complexity:[warn,20]' --rule 'max-depth:[warn,5]' --rule 'max-lines-per-function:[warn,{max:220,skipBlankLines:true,skipComments:true}]'
rtk proxy pnpm exec prettier --check apps/server/test/backtest/v3-captured-research-fixtures.ts apps/server/test/backtest/v3-captured-research-preparation.test.ts
rtk proxy node scripts/check-boundaries.mjs
rtk proxy node scripts/check-workspace-dependencies.mjs
```

五个相关文件共 **44 项通过**，新准备文件 **7 项通过**；既有准备 HTTP、未知合同冻结、子窗和费用组合回归一起执行。最终格式化后新文件 7 项再次通过。Server 类型和构建通过，局部 ESLint／复杂度／深度／函数长度无警告，Prettier、模块边界、依赖及限定 diff 检查通过。

生产代码、Schema、DSA 输入和部署配置未改动；未重跑输入未变化的全仓／DSA 高成本门禁。初次检查中的不合法测试 runId、把 manifest 引用误当费用／模型内容，以及夹具日历范围可空类型已修正，未改变生产校验。[回归日志](/private/tmp/thesis-c22b2b-regression.log)、[最终定向日志](/private/tmp/thesis-c22b2b-final-directed.log)、[类型日志](/private/tmp/thesis-c22b2b-typecheck.log)、[构建日志](/private/tmp/thesis-c22b2b-build.log)。

## 验证输入身份

| 文件 | 行数 | SHA-256 |
| --- | --- | --- |
| `apps/server/test/backtest/v3-captured-research-fixtures.ts` | 219 | `44c3357112189ee93a80ee492a8feb3bed2720addf5746465228decbbbfe268f` |
| `apps/server/test/backtest/v3-captured-research-preparation.test.ts` | 163 | `808c96fe3d8544a2a411c27f8ce73ac3be1923c97437a5d2294219027e561a40` |
| 保存日历／标的／收费依赖 | 148 | `188c7fdf26e071a7670916660f4460c3731b1eed8adc6814e74b8097471f6df1` |
| b2a 保存行情输入 | 2,002 | `2108f77c2ea553f56de9a385f8631ba74906ece25a8f547747bea7e1aa55ff4b` |

## 一致性审查与后续

本叶范围通过：两只真实股票的保存数据、已知／未知上市信息、预算父窗及子窗、准备状态、冻结校验、费用兜底和本地完整 Snapshot 已对账。数据库存储与路由为受控端口，不能替代 PostgreSQL／实际 Provider／目标容器验收；本轮没有新增目标 Run、执行目标 Runner 或修改历史结果。

C2.2b2b、C2.2b2 与 C2.2b 本地阶段完成。C2.2c 仍须在已有数据说明中接入非阻断中文提示，C3 仍须真实更新、准备与运行、两次离线重放及页面验收，C2.2 父项及 PR-AC07 保持未完成。不归档、不移入 TODO，未提交／推送。
