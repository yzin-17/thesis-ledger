# 行情时效与缓存回退原因验收

## 结论与边界

本地源码及受控样本验证通过。报价诊断经 Schema、HTTP 客户端与缓存往返保留；Desktop/Mobile 共享原因和时点展示。后续已通过正式入口同步目标容器并验证真实详情响应，原价格与双时钟保持。诊断复核命中缓存，未手动强刷真实 Provider，未修改业务数据。首次不含标的和时点的截图无法单独确定具体原因，后续真实响应已确定 `510300.SH` 为时点超阈值。

## 问题与修复

1. 原 Server 根据行情时间超过 600 秒设置陈旧，却不返回判定依据。现补充 `market_time_aged`，明确休市快照仍受现有阈值判定，保留原交易新鲜度门禁。
2. 报价 Schema 没有原因字段，Desktop 也不读取已有 `refreshFailure`。现提供可选 `staleReason`，保留 HTTP 状态并兼容旧缓存。
3. 刷新异常只剩粗分类，格式校验错误还可能被解释为缓存故障。现按来源异常和读取、写入、锁、冷却、并发等待阶段返回安全诊断。
4. 原界面根据抓取时间把旧行情视为正常刷新窗口。现要求明确冷却原因，不根据年龄猜测来源失败或刷新窗口。
5. `fallbackUsed` 在 DSA 表示选择了备用来源，不能单独证明陈旧。分段状态现在以 `stale` 或 `freshness` 为依据。
6. 详细原因、行情时间和抓取时间集中显示于横幅，报价标题保留状态徽标；缺诊断时说明当前响应的缺口。认证 HTTP 401 即使只有通用异常码也能正确识别。

排查范围包括 Server 通用分段状态、报价与基金缓存原因、Desktop 详情横幅和分段、Mobile 报价、自选列表的共享投影。基金继续读取既有结构化原因；自选紧凑行保留刷新状态摘要，完整诊断由共享标的详情承接。本次不扩大列表信息密度。

## 验证输入与结果

命令均通过 `rtk proxy` 执行，Node 使用本机可用的 26.13.0 路径。

| 检查 | 输入范围 | 结果 |
| --- | --- | --- |
| Server 定向测试 | `quote-stale-reasons`、`quote-cache-window`、`quote-concurrency`、`detail.service`、`detail.policy-v3`、`market-stale-reason`、`background-quotes`、`background-quote-contract`、`market-quote-batch`、`quote-partial-fields`、`quote-asset-type` | 11 文件、76 项通过 |
| Desktop 行情详情模块 | `pnpm --filter @thesis-ledger/desktop exec vitest run src/features/market-detail` | 46 文件、203 项通过；最终提示收敛后重跑 4 个受影响文件，24 项通过 |
| Schema 包测试 | `pnpm --filter @thesis-ledger/schemas test` | 1490 项通过，3 项按既有条件跳过 |
| Domain 包测试 | `pnpm --filter @thesis-ledger/domain test` | 785 项通过 |
| API 客户端包测试 | `pnpm --filter @thesis-ledger/api-client test` | 213 项通过 |
| Mobile 展示 | `pnpm --filter @thesis-ledger/mobile exec vitest run test/market-quote-reasons.ui.test.tsx` | 1 项通过，验证实际消费者保留原因、HTTP 状态及两个时间；原生展示基元使用受控替身 |
| 构建与类型 | Schema/Domain build、Server build、Desktop build、Mobile typecheck | 通过；无原生依赖或构建配置修改 |
| 仓库边界 | `scripts/check-boundaries.mjs` | 通过；现有包到应用的依赖禁令覆盖新增共享投影，无依赖方向变更 |
| 规模与复杂度 | 文件尺寸门禁以 HEAD 为基线；受影响函数按复杂度 20、函数尺寸 220 检查 | 通过；6 个既有文件尺寸告警均未增长，定向复杂度检查无告警 |
| 局部 ESLint 与空白检查 | 本次生产代码写集、`git diff --check` | 通过 |

扩大 Server 定向检查时，原量额测试的严格完整对象断言因新增诊断字段失败。已更新断言，继续逐字段完整比较原报价和双时钟，并增加诊断匹配；最终 76 项通过。测试样本曾缺少详情响应元信息或错误使用请求 `include` 类型，补齐受控样本后相应测试通过。

## 浏览器

脚本：`apps/desktop/scripts/check-quote-stale-reasons.cjs`；入口：`/test/browser-quote-stale-reasons.html`。使用本机 Edge 与实际 Dialog、报价分段、状态横幅、Schema 和共享展示投影，数据为受控样本。

1440、1024、768、390 四种宽度分别验证时点超限、超时、HTTP 429、冷却、旧响应五种状态；核对两个独立时间、横向溢出、弹窗边界及重试成功后提示消失。新鲜备用来源保持正常状态，页面无未捕获异常。人工查看桌面及窄屏截图，确认完整换行，详细说明不重复展示。

原始截图和结果位于 `/tmp/quote-stale-reasons-qa/`；构建、测试和检查日志位于 `/tmp/quote-reasons-*.log`，这些可重建产物不加入仓库。

## 后续真实运行态复核

用户提供带标的及时点的新截图后，于北京时间 2026-11-09 01:33:57 只读请求本机 `/api/market/510300.SH/detail?chartContractVersion=3&assetType=ETF&include=quote`：腾讯报价 `4.124`，行情时间 `2026-11-06T08:14:52+00:00`，抓取时间 `2026-11-08T17:32:17.067182+00:00`；分段为 `stale`，`refreshFailure` 和 `staleReason` 均未提供。容器内 `market-quote-diagnostics.js` 缺失，证明后端仍为原因修复前的版本。该次复核命中缓存，没有为了复现诊断手动强刷来源。

从 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行 `./scripts/sync-code.sh thesis-ledger`，采用默认非敏感参数，退出码 0。Server 与 Backtest Worker 均健康，镜像 ID 均保持 `sha256:744b2fdee55705ffe8fdd2ca62f0ca5c7f4a8cbe6ded00f27e0c0125f235141c`；未更新 DSA。日志为 `/tmp/quote-reasons-runtime-sync.log`。更新位于容器可写层，不构成镜像更新，容器重建后会恢复镜像内代码。

独立验收于北京时间 01:35:43 重读同一路径，响应请求号 `c08dc6ad-e5f5-46a1-9c2a-fa79ae928ae3`：报价仍为 `4.124`，行情与抓取时间均与同步前一致，`servedFromCache=true`，新返回 `staleReason.code=market_time_aged`，说明为“来源行情时间距当前已超过 10 分钟，触发行情时效阈值；休市快照也按此阈值判定。”容器只读检查确认新诊断模块存在。该项证明真实报价原因已贯通；现有按自然时间计算的阈值和交易门禁仍然生效。
