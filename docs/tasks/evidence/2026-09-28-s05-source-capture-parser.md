# S05 原文捕获摘录解析证据

## 范围与结果

任务标识：`S05-source-capture-parser-0928`。状态：本次纯函数与单元门禁已完成，无阻塞项；最终严格 PIT 与真实来源准入仍待独立验收。

依据当前 Spec §6.1 登记，新增 `parseMarketPitSourceCaptureV1({ publication, archive, dataAsOf })`。`publication` 复用 `HistoricalDecisionWindowV3` 的原文结构，`archive` 复用实际完整内容门禁输出的 `MarketPitBoundArchiveV3`，只以 type import 引用 Market 模块。输入归档须由调用方先完成完整内容门禁；该函数不复算价格内容，不创建归档、价格事实或采集时间。成功结果为 `source-capture-bound`，保留归档原身份、响应摘要与 `fetchedAt` 文本，`knownAvailableAt` 取原 `fetchedAt`。

登记固定 `thesis-ledger-server-archive-capture-v1`、`server-archive-capture`、`ThesisLedger Server`、版本 `1`、归档身份对应的 URN 和三字段 JSON 定位。原文仅接受 UTF-8 JSON 的 `windowIdentityFingerprint`、`completeResponseHash`、`fetchedAt` 三个 string 字段；完整原 UTF-8 字节 SHA-256 必须相符，顶层重复键（包括转义后的重复键）、多余字段、缺字段及错误结构均拒绝。归档主响应摘要与 evidence 摘要同时核对。大小上限复用证据协议的 8 MiB，编码前检查字符数量、编码后检查字节预算；孤立 surrogate、BOM、字节数组及非 UTF-8 声明拒绝。非法 JSON 只返回稳定错误码，不返回原文片段。

证据专用瞬时 helper 将已经逐字段检查的四位公历年、月日、时分秒和已知显式偏移转换为整数秒，小数部分独立保存并精确比较，最多 1,024 位；Date 仅参与整数秒转换。非法公历日期、24 点、闰秒、非法偏移、无偏移及表示未知偏移的 `-00:00` 失败关闭。同一瞬时的不同 offset 与尾零等价，但结果不改写原归档时间文本。`knownAvailableAt` 必须等于原 `fetchedAt`，`fetchedAt <= acquiredAt <= dataAsOf`；不从 `sourceObservedAt` 补齐抓取时刻。

## 工具函数选型

已使用 `recommend` skill：实际 Server manifest 为 `es-toolkit ^1.51.0`，本地解析版本为 `1.51.0`，已检查运行时入口与 `dist/predicate/isJSON.d.ts`。官方 [isJSON 文档](https://es-toolkit.dev/reference/predicate/isJSON.html) 说明该函数仅检查 JSON.parse 能否解析；不核验重复键、三字段捕获合同、完整 UTF-8 摘要或精确亚毫秒时钟，因此本次采用领域专用解析与原生编码、摘要、比较操作。未增加依赖或通用 utils。

当前工具集中未提供 Context Mode；分析读取使用 Python 限量摘要，测试仅保留最终统计，未输出真实来源原文、数据库或 Provider 日志。

## 定向验证

以下检查均以最终三个拥有文件为输入，2026-09-28 完成：

- Server 目录执行 `rtk proxy pnpm exec vitest run test/market/market-pit-source-capture-v1.test.ts --cache=false`：1 个文件、57 个测试全部通过。
- 仓库目录执行 `rtk proxy pnpm exec eslint apps/server/src/market/market-pit-source-capture-v1.ts apps/server/src/market/market-pit-evidence-instant-v1.ts apps/server/test/market/market-pit-source-capture-v1.test.ts --max-warnings=0 --rule 'no-nested-ternary:error' --rule 'complexity:[error,20]' --rule 'max-lines-per-function:[error,{max:220,skipBlankLines:true,skipComments:true}]'`：退出 0，无警告。
- 对拥有文件与本证据文档执行 Prettier 检查及 `git diff --no-index --check /dev/null <拥有文件>`：通过；新增文件采用单独空白检查，因为普通 git diff 不覆盖 untracked 文件。

覆盖内容包括原输入及价格事实不变、实际 repository 单元端口读回后完整内容门禁接缝、错误登记、错归档 identity/hash/fetchedAt、原字节摘要、额外/缺少/重复/转义重复字段、未知与未来获取、精确相等边界及微秒以下截点、offset 等价、非法公历/偏移、非规范 Unicode 与编码字节预算。fixture 是业务单元输入，不能作为真实发布原文或来源准入依据。

未执行包级 typecheck/build、全包测试、数据库、网络 Provider 或部署；未修改其余源码、测试、index、manifest、Spec 或 Task 台账。Server 定向 Vitest 与拥有文件 lint 资源已释放。

## 最终输入摘要

| 文件 | 行数 | SHA-256 |
| --- | ---: | --- |
| `apps/server/src/market/market-pit-source-capture-v1.ts` | 145 | `990ad6aa7b590049c1aa23cf72544b4653a257a97691d65e0562d178b00e6abb` |
| `apps/server/src/market/market-pit-evidence-instant-v1.ts` | 62 | `e6fe936cfcd90ec6bf17bc9905903f80792f94cefb0c0dcad4c05a16c7768f76` |
| `apps/server/test/market/market-pit-source-capture-v1.test.ts` | 254 | `796cd574036a77cfddab88d3bec61dbc2b57b08371777956a3006ec5339cb2c7` |

## 后续验收边界

捕获绑定不证明更早 decisionAt 的来源修订已公开。调用方仍需独立的证券场所、日历、原修订发布和历史窗口门禁；只有最终 `historical-window-bound` 结果可签发严格历史来源资格。当前纯函数未接入生产注册分派、预检或冻结路径，此类集成由协调者另行拆分任务。
