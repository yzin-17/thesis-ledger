# 未知上市日期结果说明本地验收

日期：2026-10-07。对应 [C2.2c](../../archive/tasks/2026-10-03-multi-source-remaining-acceptance.md) 与 [普通研究窗口规格](../../specs/2026-10-03-multi-source-remaining-acceptance.md#research-window-policy)。本记录覆盖本地结果说明，目标部署与页面业务验收由 C3 负责。

## 结果行为

V3 Runner 从已经冻结的行情覆盖信息读取上市状态；只有明确未知时，在原有 `warnings` 中加入共享中文文本：

> 未获取上市日期，未验证回测窗口与上市日期的边界关系

既有 Desktop 价格与记账说明区域展示该文本；完整和部分完整结果均保留原状态。没有新增结果字段、确认控件或弹窗，也不修改收益、成交、费用和结果完整性。已知输入不增加提示，旧结果缺少提示时继续沿用原展示；历史数据库结果未回写。

JSON 诊断沿用已有 warnings 脱敏链路，摘要增加相同的数据说明。停复牌及费用披露保留。移动端当前没有回测结果消费面，类型兼容检查仍执行。

## 验证与边界

修改前先测得既有已知输入的实际 Runner 校验和 `7aa84c45e97d07ff`；修改后保持。实际未知输入的成交、净值、metrics、benchmark 与完整性均同已知输入一致，只有说明和相应结果校验和变化；断网后两次运行仍一致。未知结果校验和为 `9217f859a01fab0e`。这组输入是现有受控 Snapshot 夹具，不是新目标 Provider 回测。

[UI 输入夹具](../../../apps/desktop/test/fixtures/backtest-listing-disclosure-v3.json)来自这两份实际 Runner 输出。组件测试验证非阻断文本、旧结果无提示、完整性不变，以及 JSON／摘要保留说明但不泄露其他警告中的测试凭据。真实浏览器／目标新结果仍待 C3。

Server 上市说明与实际 Runner 首批 12 项通过；冻结、准备、稀疏 Runner、收费及模型相关六个文件共 34 项通过。Desktop 上市／模型／诊断／停复牌／费用五个文件 29 项通过；Schema 全包 731 项通过，Desktop 全包 719 项通过。价格说明函数随后将新段落按上市说明职责提取为同文件组件，原函数复杂度未增加，受影响 29 项再次通过。

Server 首轮全包为 2,496 项通过、217 项跳过及 1 项超时：未修改的 `market-period-reader.test.ts` 在同时执行其他包检查时超过默认 5 秒。该文件代码未改，隔离复验 14 项通过；最终串行全包结果在下方收口记录补充，不把初轮记为通过。

Schema、Server、Desktop、Mobile、API Client、DSA Adapter 类型检查通过；Schema、Server、Desktop build 通过。局部 ESLint／复杂度／深度／函数长度检查无警告，Prettier、模块边界与工作区依赖检查通过。没有原生工程、依赖、数据库结构或部署配置改动。

shadcn 锁定 CLI 确认项目使用 Base、Tailwind v4 和已安装 Alert，核对本地组件及[官方 Alert 组合用法](https://ui.shadcn.com/docs/components/base/alert)。只复用原 `AlertDescription`，未添加组件、传统 CSS 或更改现有样式。

```sh
rtk proxy pnpm --filter @thesis-ledger/server exec vitest run test/backtest/listing-disclosure-v3.test.ts test/backtest/v3-unknown-listing.test.ts test/backtest/v3-captured-research-preparation.test.ts test/backtest/v3-sparse-tradability-runner.test.ts test/backtest/public-fees-snapshot-v3.test.ts test/backtest/model-disclosure.test.ts
rtk proxy pnpm --filter @thesis-ledger/desktop exec vitest run test/backtest-listing-disclosure.test.tsx test/backtest-model-disclosure.test.tsx test/strategy-backtest-diagnostics.test.tsx test/backtest-trading-status-disclosure.test.tsx test/backtest-public-fees-disclosure.test.tsx
rtk proxy pnpm --filter @thesis-ledger/schemas test
rtk proxy pnpm --filter @thesis-ledger/server test
rtk proxy pnpm --filter @thesis-ledger/desktop test
```

[Server 定向日志](/private/tmp/thesis-c22c-server-regression.log)、[Desktop 定向日志](/private/tmp/thesis-c22c-desktop-directed.log)、[Server 初轮全包](/private/tmp/thesis-c22c-server-full.log)、[周期读取隔离复验](/private/tmp/thesis-c22c-period-recheck.log)、[Server 串行复验](/private/tmp/thesis-c22c-server-full-recheck.log)、[Desktop 全包](/private/tmp/thesis-c22c-desktop-full.log)。诊断定向初次失败是测试少传了导出函数的 result 参数，修正后 29 项全部通过；未更改既有脱敏规则。

## 验证输入

输入包括共享日级 Schema、Server 上市说明 helper／Runner／两份测试、Desktop 价格说明／诊断摘要／独立测试及 UI 夹具，共九份文件。按路径排序，以 `路径 + NUL + 文件字节 + NUL` 拼接的 SHA-256 为 `dd5e73a0e4485e54ec0879803822669be25fed1d8a13e3905a10e66cacfb1e96`。

## 收口记录

最终串行 Server 全包退出 0：307 个文件／2,497 项通过，47 个文件／217 项按环境跳过，耗时 66.32 秒，无失败。隔离复验及串行全包均未修改周期读取测试或提高其计时上限。

一致性审查通过本叶本地范围：冻结状态、原 warnings 传递、计算与完整性、已知校验和、旧结果消费、非阻断 UI、诊断脱敏及所有声明的本地门禁已对账。C2.2c 和 C2.2 本地阶段完成，PR-AC07 产品验收与 C3 保持未完成。目标运行态、P5、路由、DSA 与数据库未修改，未提交／推送。C3 仍须先更新 Server／Schema 再更新 DSA，并完成实际准备、运行、离线重放及页面验收。
