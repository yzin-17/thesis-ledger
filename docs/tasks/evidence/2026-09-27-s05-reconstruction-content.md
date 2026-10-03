# S05 历史重建原文与实际归档内容实施记录

## 完成范围

`S05-reconstruction-market-content` 的本地实现完成。`MarketPitReconstructionRepository` 已注册为 Market 内部 Provider，依赖实际 `MarketWindowEvidenceV3Repository.findFrozen`。重建核验由 Market 拥有，边界门禁新增其他 Server feature 不得直接依赖原始归档 repository 或 Prisma 表的规则。

只读清单配置为成对的绝对路径 `MARKET_PIT_RECONSTRUCTION_FILE` 和小写 SHA-256 `MARKET_PIT_RECONSTRUCTION_SHA256`。引用必须为 `market-pit-proof-v1:<原文摘要>`。每次从文件重新读取，限制普通文件、有效 UTF-8、32 MiB 上限及精确摘要；删除、改动、未知字段、损坏和缺配置均拒绝，没有复用上次成功的清单。

归档读取重新核验原响应摘要、派生序列身份、精确标的/路由/实际目标、完整价格坐标及逐 Bar 原始内容。供应商定义的相同坐标允许多个独立完整日窗口；`request-window` 坐标拒绝不同范围。来源观察时刻可以不同，仍完整保存，并与 Server 实际抓取、原 Bar 时间及 availableAt 一起受冻结截点限制。缺失、失败、内容不符或未来事实均关闭供给。

同一归档只读一次，每个窗口建立 Bar 时间索引，避免对长序列逐 Bar 重扫完整窗口。输出为深复制的原文、原文摘要、严格清单和去重后的完整归档，包括原请求/响应、版本、摘要及抓取证据；日期采用 ISO 文本供后续冻结使用。

结果仅为 `archives-bound`。研究时抓取的历史窗口即使内容匹配，也没有获得历史决策时点资格；正向测试明确检查没有 `eligible` 或 `verified`。

## 已执行验证

- 新增 40 项：实际归档内容 21 项、只读清单 13 项、配置 6 项；包含于相关 8 文件/104 项回归，不重复计数。
- 数据库端口由内存 Map 替代，但创建、身份派生、完整响应摘要、原事实解析及读取均使用实际归档 repository。测试覆盖去重、三个完整日窗口、不同请求基准、错源/标的/修订/基准/数量事实、合法摘要下的不同价格/量额/可用时间及缺 Bar、缺失/损坏、未来观察/抓取和配置/文件撤销。
- Server typecheck、build、定向 ESLint（含复杂度、函数尺寸和禁止嵌套三元）、边界、工作区依赖、diff check 通过。实际编译 Market 模块包含新 Provider，显式构造器注入元数据存在。
- 全仓尺寸检查保留 13 项既有无有效基线警告，没有宣称既有尺寸债务消除。新增核验函数第一次复杂度为 21，提取独立冻结截点判断后定向检查无警告，没有放宽阈值。
- 首次缺 Bar 夹具违反既有完整日历合同，改用合法短窗口后第一次重试通过。尺寸脚本初次使用错误文件名，核对 package scripts 后第一次重试通过。编译模块检查初次从仓库根目录不能解析 Server 专属依赖，切换 Server 目录后第一次重试通过。

相关回归命令：

```sh
rtk proxy pnpm --filter @thesis-ledger/server exec vitest run test/market/market-pit-reconstruction-content-v3.test.ts test/market/market-pit-reconstruction.repository.test.ts test/platform/pit-reconstruction-config.test.ts test/market/market-window-evidence-v3.repository.test.ts test/market/market-frozen-window-reader-v3.test.ts test/market/market-series-identity.test.ts test/market/market-chart-proof.repository.test.ts test/platform/services.test.ts
rtk proxy pnpm --filter @thesis-ledger/server typecheck
rtk proxy pnpm --filter @thesis-ledger/server build
rtk proxy node scripts/check-boundaries.mjs
rtk proxy node scripts/check-workspace-dependencies.mjs
rtk proxy node scripts/check-file-size-guardrails.mjs
```

日志位于 `/private/tmp/goal-s05-reconstruction-content-*-20260927.log`，当前成功结果包括 regression、typecheck、build、lint、boundaries、workspace、sizes。旧 complexity 日志保留第一次警告，最终含复杂度规则的 lint 日志无警告。

## 继续实施与验收边界

`S05-reconstruction-market-time`：实际历史修订在每根 Bar 决策时刻的可见性仍待实施，须区分供应商观察与 Server 传输/抓取时间，并保留真实来源依据。当前 `archives-bound` 不允许替代该阶段。

`S05-reconstruction-consumers`：生产预检现有非空引用判断尚未替换，Snapshot 尚未消费和封存上述结果；后续须贯通核验、冻结与离线重验，另做部署配置传递和目标运行态验收。

本轮没有实际 PostgreSQL、Docker 同步、外部 Provider、历史归档或浏览器验收，没有创建回测/AI。原 I01 JSONB 往返卡点保持耗尽重试后的跳过状态，不将受控内存数据库当成实际存储证据。S05 和重建父项继续未完成，全目标保持 active。
