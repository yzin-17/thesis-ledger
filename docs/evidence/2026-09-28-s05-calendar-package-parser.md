# S05 固定日历包原发布解析器实施证据

## 状态与范围

`S05-calendar-package-parser-0928 / worker_done`：独占源码、测试、自审和真实公开输入正向探针完成；协调者修复空源码 Schema 并刷新稳定导出后，最终 3 文件、76 测试通过。权威依据为主 Spec §6、`2026-09-28-s05-calendar-parser-discovery.md` 和 `2026-09-28-s05-window-schema.md`；基线为指定 `main / fe0e871e`，保留所有既有工作，不暂存、不提交、不重置、不清理。

仅新建三个 Market 模块、三个对应测试和本文。原发布入口、源码树认证/专用提取、连续日期投影各有独立语义职责；没有修改 Schemas、共享导出、repository、Backtest、DSA、配置或依赖，也没有添加整包源码 fixture。三个源码模块分别为 214、109、134 行。

解析结果只证明固定包原发布与 `CN/XSHG/Asia/Shanghai` 的 2026 年常规日历投影。它不授予证券场所绑定、严格 PIT、来源修订或最终运行资格，不能覆盖 `159516.SZ` 的 XSHE。日历对象中的 `symbolScope` 和 `venueBindingEvidenceIds` 仍是调用者的声明，供后续独立场所核验消费，本解析器不签发这些字段。

## 公开 API 与调用合同

`market-pit-calendar-package-v1.ts` 导出：

- `parseMarketPitCalendarPackageV1({ publication, artifact, calendar, dataAsOf, decisionAt? })`。
- `CalendarPackageParseInputV1`、`CalendarPackageParseResultV1`。
- 固定、冻结的 `XSHG_PACKAGE_PUBLICATION_REGISTRATION_V1`。
- 用于单独验证专用核心字段及 JSON 防护的 `verifyCalendarPackageMetadataV1`、`parseCalendarPackageJsonV1`。

输入三条记录类型直接复用 `HistoricalDecisionWindowV3` 对应集合的元素。返回 `{ status: 'calendar-package-verified', calendar, knownAvailableAt }` 或 `{ status: 'unavailable', reason }`；成功输出逐日状态、时段和摘要均由固定源码重新计算。返回状态不是历史资格状态。辅助函数或投影 hash 函数的成功也不建立发行信任，生产消费必须调用完整固定入口。

`decisionAt` 若传入，以无损整数微秒核对 `publishedAt <= decisionAt <= dataAsOf`；后续逐 Bar 调用者必须传入该时点，或用同一微秒比较函数检查每根 Bar 的发布可见性。省略它只验证原发布、获取截点与投影，不能据此声称某个历史决策已满足可见性。发布原文和日历的 `acquiredAt` 均不得早于原发布或晚于 `dataAsOf`。原发布时间保留六位微秒，`03:24:37.055241Z` 不被毫秒截断成合法，精确 `03:24:37.055242Z` 相等允许。

源码模块导出 `verifyXshgPackageSourceV1`、`extractXshgPackageSourceV1`、`decodeCalendarPackageBase64V1` 和冻结的源码登记。专用提取接缝允许受控语法向量测试，生产仅在完整树认证后调用；不可把其任意输入提取结果当可信包。投影模块导出 `recomputeXshgPackageProjectionV1`、`xshgPackageProjectionHashV1`、`xshgPackageCalendarContentHashV1`、`calendarPackageInstantMicrosV1` 以及归一化和时区规则常量。

## 固定注册与字节核对

| 项目 | 固定值 |
| --- | --- |
| parser | `pypi-exchange-calendars-4.13.2-xshg-v1` |
| 发布主体 | `PyPI / exchange_calendars`，不是交易所发行者 |
| 原文 origin | `https://pypi.org/pypi/exchange-calendars/4.13.2/json` |
| 原文大小 / SHA-256 | 28,845 / `38a86c1c1058cbaa84cb85ecafea74f9b19a7b87c10998a82f9df230bb52a87a` |
| wheel 大小 / SHA-256 | 213,306 / `fc5a2ad0d61b5c3a6539a3061cd4cbb55c59f4a903455cec7926e4b798919996` |
| 已知可见边界 | `2026-03-10T03:24:37.055242Z` |
| 定位 | `urls[filename=exchange_calendars-4.13.2-py3-none-any.whl].upload_time_iso_8601` |
| 源码集合 | 93 个 `.py`，原字节合计 695,008 |
| 源码树 SHA-256 | `3dd6286cd2404bbe188e843a7ada5625164fff6059eb18c69d080213c3e29dea` |
| XSHG 文件 SHA-256 | `0450145f89c503f7311ebdabfa75177b21cd01aa5ec2dcc54cfc5a23f118336a` |

完整入口先验证原字节长度、固定 SHA-256 和自报 SHA-256，再执行严格 UTF-8 解码、拒绝 BOM、完整 JSON 语法和同一对象内重复键（包括转义后同名键）检查。发布主体、origin、revision、parser、种类、定位、可见边界均固定；唯一 wheel 的 filename、packagetype、python_version、原 URL、摘要、大小、yanked 和六位微秒时间逐项核对。原文包含的合法非核心字段无需改写。当前 HTTP 端点若未来原字节变化，入口失败关闭，需重新审查注册，不能让调用者自改摘要获得信任。

源码原文必须规范 base64，预算在解码前后检查；路径规范、唯一、位于 `exchange_calendars/` 且为 `.py`。重算每份原字节摘要，再以排序的 `relativePath:sha256`、换行连接且无末尾换行形成固定树。缺、多、重复、越界路径或重新自报文件摘要均不绕过登记树。

实际 wheel 含两个合法零字节源码：`exchange_calendars/pandas_extensions/__init__.py` 和 `exchange_calendars/utils/__init__.py`。空文件以规范空 base64 表达，其文件存在性与内容仍受路径、93 文件数、空字节 SHA-256 和整个固定树共同证明。此事实揭示 Schema 原先把文件 base64 复用非空原文约束的缺口，已交协调者及独占 Schema 修复叶处理；发行原文仍应非空。

认证后的 XSHG 文本只提取唯一明确的 `pd.to_datetime([ ... ])` 字符串列表，接受空白/注释及精确双引号日期行，拒绝表达式、拼接、重复或无效日期。605 日期和唯一类名/父类/name/timezone 及四个 `((None, time(h,m)),)` 属性必须符合固定源码；时段为 570、690、780、900 分钟。生产不执行 Python、不解析 ZIP、不引入通用代码解释器或通用日历 parser。

wheel 到源码树、固定 weekday/adhoc 语义是审核登记的可信根。生产保存源码的路线不能从源码重算 ZIP SHA-256；本文的公开 wheel 原字节核对属于独立只读探针，不改变生产入口的这一边界。

## 投影与规范数组

日期范围只接受 `2026-03-10..2026-12-31` 内的真实连续民用日期（最多 297 天）。周末优先为 `closed/weekend`；其余固定假日为 `closed/exchange-holiday`；普通工作日为 `open/regular`。普通日期生成 `[570,690]` 和 `[780,900]` 两个时段，以固定 `+08:00` 复算成 UTC 当日 `01:30–03:30`、`05:00–07:00`；不使用宿主 tzdb。每个日期与时段的发布链接均来自实际发布记录 id。HK/US、其他交易所/时区、DST、半日、特殊时段、跨午夜或范围外日期失败关闭。

投影摘要以 UTF-8 的 `JSON.stringify` 固定顺序数组表示，顺序为：

1. `exchange-calendars-4.13.2-xshg-projection-v1`、market、exchange、timezone、timezoneRulesIdentity。
2. `[range.start, range.end]`、calendar.publicationIds。
3. 连续日期的 `[date, status, reason, publicationIds, sessions]`；每个时段为 `[startMinute, endMinute, openedAt, closedAt]`。

内容摘要数组顺序为 `exchange-calendars-4.13.2-xshg-content-v1`、parserVersion、原发布 SHA-256、artifactSha256、sourceTreeHash、`[range.start, range.end]`、projectionHash。输入投影自身的规范 hash、声明的 projectionHash 和原字节复算结果必须相同，内容摘要也必须相同；自行删假日或修改 UTC 后重新计算两个声明摘要仍不能通过。

独立 Python 标准库构造 `2026-04-03..2026-04-07`（publication id 为 `publication`）的同版固定数组得到：projectionHash `7102cbac42e73362553c69e65828601b3d7d5897bb6c6ee0f835d91ac511a01e`，calendarContentHash `a6200b338b1e6e7edd19800d32b30ed89c97621f04de589ba90af7148251f025`；作为固定测试向量，避免测试仅从实现反向生成常量。

## 公开输入探针与验证

只读获取官方原 JSON 和固定 wheel；初次探针把 metadata 与 93 份原源码的输入包暂存到 `/private/tmp/s05-calendar-package-0928`，不在项目中、不跟踪，也没有将源包内容输出到上下文。后来独立获取 wheel 原字节仅在内存计算，其大小和摘要均匹配上述登记。生产源码不访问网络或环境变量；测试的公开输入探针使用 `S05_CALENDAR_PUBLIC_INPUT_DIRECTORY` 明确选择外部准备的输入目录，不安装任何依赖。

已完成的中间验证：

- 首轮三个定向测试 75/76 通过，唯一失败为真实零字节 `.py` 被初始 base64 防护拒绝；原始失败原因及输入保留。
- 修复空文件后一次定向重跑为 3 文件、75 测试全部通过（新增预算测试和固定向量此前尚未加入）。该运行只证明 Server 入口，未验证当时仍未修复的 Schema 链。
- 六个拥有文件的 Prettier、ESLint `--max-warnings=0`（额外 `complexity:[error,20]`）和定向 `git diff --check` 通过；没有关闭复杂度规则或添加 ignore。

测试初轮使用默认 Vitest 缓存；后续及最终使用 `--cache=false`，不写报告，不启用 coverage。ESLint 初次指出不必要断言、正则空格和转义，定向修复后通过；第二次修复命令尚有三个非自动修复转义错误，分析并修改对应代码后通过，没有无变化地重复失败命令。

协调者稳定 Schema 导出后执行最终命令，3 文件、76 测试全部通过，无 skip；同时验证真实制品和原发布记录通过已修复 Schema 的对应记录集合结构检查。此接缝只验证真实原包记录，不构造来源见证或证券场所证据，不代表整个历史窗口最终核验。

`S05_CALENDAR_PUBLIC_INPUT_DIRECTORY=/private/tmp/s05-calendar-package-0928 pnpm --filter @thesis-ledger/server exec vitest run --cache=false test/market/market-pit-calendar-package-v1.test.ts test/market/market-pit-calendar-package-source-v1.test.ts test/market/market-pit-calendar-package-projection-v1.test.ts`

最终测试分布为入口 25、源码 27、投影 24。生产注册、原文和源码树保持固定；真实资料正向探针是唯一要求外部输入目录的测试，未设置环境变量的普通调用会明确跳过该单项，不能据此把未执行的公开输入验证记作通过。最终六文件 ESLint（含复杂度 20）及格式复核通过；本叶的最后原文、源码、投影和微秒负例均在同一次最终运行中执行。

负例覆盖元数据登记替换、重复 wheel、sdist、URL/digest/size/yanked/time、原文篡改并自报新摘要、UTF-8/BOM/重复 JSON 键、非规范 base64、源码文件路径/数量/摘要/完整树/预算、未知语法与假日删除、日期断档、午间/UTC/分钟/链接篡改并重新哈希、scope/range、特殊时段与微秒公开/获取/冻结截点。公开探针还验证 utf8/base64 两种原文封存和整个 297 日登记范围。

未执行 Server build/typecheck、全仓库门禁、数据库、Docker、浏览器、Provider、场所资料核验、来源见证、实际执行日历比较或最终 PIT/离线资格。上述阶段由协调者与后续独立叶负责，不用本地 parser 成功替代。

## 最终源码身份

| 文件 | SHA-256 |
| --- | --- |
| `apps/server/src/market/market-pit-calendar-package-v1.ts` | `0330d5a5325f77924f2c8ac3f79e3d1f1bbe1b9bab746756b1d3b72fd7c479dd` |
| `apps/server/src/market/market-pit-calendar-package-source-v1.ts` | `efed42b9895ecf4e1fc89e9c0415f1771c013365f7bdc59b4000781fe4b35d2a` |
| `apps/server/src/market/market-pit-calendar-package-projection-v1.ts` | `7337c2f2cb5053bf020218a4347fd86535f7b23a7fe4ed25df7761c7b2534965` |
| `apps/server/test/market/market-pit-calendar-package-v1.test.ts` | `3af01a9473d910fed9941d7ec9c3724663bdd202ca7da0b3ece2f9833dcb94a7` |
| `apps/server/test/market/market-pit-calendar-package-source-v1.test.ts` | `5924569e0a32aa901678335aa92b4da0b1cb2439376edf80b810f03bf400bebc` |
| `apps/server/test/market/market-pit-calendar-package-projection-v1.test.ts` | `0e43110ef42282f07914074046d5362fd88fb85b27e8466a460f7cfe1c2f8118` |
