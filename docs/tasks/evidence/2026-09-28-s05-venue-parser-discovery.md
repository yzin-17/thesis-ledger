# S05 证券场所原证据与固定解析器发现

## 结论与任务状态

`S05-venue-parser-discovery-0928 / worker_done`。有界发现完成；严格场所准入仍为 `blocked`。本轮取得独立官方原文，确认 `159516 → 深圳证券交易所 / XSHE` 的首次上市事件和 `588000 → 上海证券交易所 / XSHG` 的首次上市事件；没有取得可直接证明所需连续历史日期范围内持续有效的场所材料。两份公告的上市日期不得向后无限扩展为 2026 年有效场所范围，也不授予严格 PIT ready。

深交所固定 HTML 的身份、首次上市起点和日级公告日期可设计有界专用 parser。该可行性仅针对原文事实提取，不代表完整历史 `symbolScope`、日期范围与 `knownAvailableAt` 准入义务已闭合。上交所 PDF 原字节已保存，但本轮没有可登记的离线 PDF 文本解析链；不得将网页搜索摘录或人工转录正文放入 JSON 后当成原始出版物 parser。

唯一写入为本文。工作区核对为 `main / fe0e871e`；核对时已有 156 个 tracked 改动和 414 个未跟踪文件，全部保留。未改源码、Schema、主 Spec、台账或其他 evidence，未读取正在拆分的 `packages/schemas/src/market-pit-*`。没有测试、构建、数据库、业务请求、目标运行态、凭据读取或部署。当前工具目录没有可调用 Context Mode；按 RTK 使用内存获取、过滤、定位和摘要计算，只输出必要事实。

## 依据与已核对的 DSA 边界

- [主 Spec §6](/Users/yzin/code/thesis-ledger-workspace/thesis-ledger/docs/specs/2026-09-25-multi-source-adjustment-aware-backtest.md:226) 要求精确交易所、标的范围、独立证券交易所证据、连续日期范围及原发布记录解析；未知 parser 失败关闭。对应证据必须在决策时刻已可见；原字节、摘要、归一化与时间规则必须保留。§6 对现在重新获取的历史档案另要求不可变原始捕获证明，本次 HTTP 成功没有自动满足该义务。
- [既有日历发现](/Users/yzin/code/thesis-ledger-workspace/thesis-ledger/docs/tasks/evidence/2026-09-28-s05-calendar-parser-discovery.md) 和 [DSA 发布登记](/Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis/src/services/thesis_ledger_calendar_release.py:8) 固定 `exchange-calendars 4.13.2`、公开可用时刻 `2026-03-10T03:24:37.055242Z` 及 93 源文件树；仅投影 XSHG，不提供证券名录或 XSHE 日历。
- DSA 执行日历（当时源码定位 `/Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis/src/services/thesis_ledger_v2_dependencies.py:126`；该旧路径已退役，现行合同见 Canonical） 实际调用 `get_calendar("XSHG")`。即使取得 159516 场所事件，仍不能以 XSHG 日历签发 XSHE 资格。
- DSA 静态标的事实（当时源码定位 `/Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis/src/services/thesis_ledger_v2_dependencies.py:179`；该旧路径已退役，现行合同见 Canonical） 只包含标的、市场、类型、币种、lot/tick 等，不提供独立场所发布原文；源码明确不得作为全请求历史区间可交易证明。
- [DSA 目录入口](/Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis/src/services/thesis_ledger_catalog.py:227) 消费 `stock_info_a_code_name`、`fund_etf_spot_em`、`fund_name_em`；[目录来源登记](/Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis/docs/thesis-ledger-catalog-source-evidence.md:23) 列出官方股票 endpoint 与东方财富 ETF endpoint，但现有今日列表与名称消费均不建立历史场所有效范围。本轮没有调用这些 endpoint，也没有重试已耗尽的 BaoStock 批量身份路径。

## 已取得的独立材料

| 项目 | 候选 A：159516 | 候选 B：588000 |
| --- | --- | --- |
| 原文链接 | [深交所上市交易公告](https://www.szse.cn/disclosure/notice/fund/t20230724_602100.html) | [上交所托管的上市交易公告书](https://www.sse.com.cn/disclosure/fund/announcement/c/2020-11-11/588000_20201111_2.pdf) |
| 发布主体与托管 | 正文署名深圳证券交易所，官方深交所站点托管 | 公告编制及保证主体为华夏基金管理有限公司，上交所官方站点托管；不把基金管理人冒充交易所发布者 |
| 格式、大小 | UTF-8 HTML，16,126 原字节 | PDF，430,850 原字节，网页工具识别 42 页 |
| SHA-256 | `cb3aabff8709091d9e534b5979e14bcbe3d825a51826aabf87c3a265b17751dc` | `46af95b681fe58d9c409d2252be57404c5191fd2b678ba4a9781c588f852f2c3` |
| 本次真实获取完成 | `2026-09-27T17:34:24.777453Z` | `2026-09-27T17:34:25.182618Z` |
| 原文日期及定位 | `div.time > span` 为 `2023-07-24`；正文末尾署名日期一致 | 物理第 1 页封面“公告日期”为 `2020年11月11日` |
| 精确标的与场所定位 | `div#desContent` 的第 1 段包含 159516 及上市起点；第 3 段署名深圳证券交易所 | 物理第 3 页“二、基金概览”第 4、8、9 项；物理第 5 页“本基金上市交易的主要内容”第 2、3、5 项交叉一致 |
| 可直接提取的事件 | 159516 在深交所首次上市，起点 `2023-07-27` | 588000 在上交所上市，起点 `2020-11-16` |
| 不能直接签发的范围 | 任意 2026 年连续日期上的持续有效场所范围；退市、转场或变更完整性 | 任意 2026 年连续日期上的持续有效场所范围；退市、转场或变更完整性 |

本次 HTML 的 HTTP `Last-Modified=2026-05-30`，PDF 的 HTTP `Last-Modified=2025-07-18`；这类响应头只说明当前服务器元数据，不能替代 2023/2020 年真实发布时点。搜索结果的 Published/Crawled 字段与 PDF 文件名日期也不作为历史发布时间证据。正文日期是官方材料中记載的公告日，和本次 `acquiredAt` 分别保存。

本文末尾保留两份完整 base64 原字节。只有解码后与大小、SHA-256 同时一致的字节才是捕获材料；本文的说明、摘要表、规范化文字与网页工具的 PDF 提取结果都不是原出版物。

## 候选 A 的最小固定解析器提案

可设计 `szse-159516-listing-notice-20230724-v1`，仅处理上表固定 origin 和固定原文摘要。本提案尚未登记或实现，不引入任意 HTML 抓取系统。

1. 解码前后执行有界预算：仅接受这份 16,126 字节 UTF-8 HTML，先重算完整原文摘要再提取；错 origin、publisher、摘要、大小、编码、重复定位或未知 parser 均拒绝。固定摘要是公开获取后审核的信任登记，不由调用者自报相同 SHA 建立真实性。
2. 唯一标题定位为 `<h2 class="title">`；公告标题须与本材料对应。唯一时间定位为 `<div class="time">时间：<span>2023-07-24</span></div>`。不得扫描页面任意日期或读取 script。原文 0 基 UTF-8 byte offset：标题 `8023`、时间 div `8506`、正文起点 `8833`、证券代码 `9355`、正文交易所署名 `11863`。这些 offset 是固定材料核对辅助，不由输入自由指定。
3. 仅在唯一 `<div class="des-content" id="desContent">` 所含已固定四个段落提取文本；移除本段已核对的 span/o:p 标记、解码 HTML 实体和合并空白，不能执行 JavaScript、解析任意页面语义或通过全文搜到站点关键词判断交易所。第一段提取六位代码 `159516`、基金名称、首次上市日期 `2023年7月27日`；第三段须精确为深圳证券交易所，第四段规范化日期为 `2023年7月24日`，与 header 日期一致。登记规则才将该明确正文交易所名映射至 `XSHE`，不依据证券后缀作身份推理。
4. 输出可确定的事件为 `{ market: CN, symbol: 159516.SZ, exchange: XSHE, listingDate: 2023-07-27, noticeDate: 2023-07-24 }`。这是首次上市事件；原文没有明确连续历史有效区间终点或变更完整性，解析器不能自造 `validTo=2026-12-31`、无限未来有效或任意提交的 `symbolScope`。
5. 原文只有日级公告日期，没有精确时分秒或独立同期捕获。若协调者确认官方日级发布记录及固定审核根满足本类型的公开边界契约，可以另登记保守规则 `date-only-Asia-Shanghai-next-midnight-v1`，候选边界为 `2023-07-25T00:00:00+08:00 = 2023-07-24T16:00:00Z`，保留 date-only 精度；该值是保守归一化，不是原文记载的精确发布时间。当前未获该规则和历史公开真实性根的准入判定，故不能把此候选直接填为已核验 `knownAvailableAt`。
6. 本次真实 `acquiredAt` 必须不早于批准的公开边界且不晚于冻结 `dataAsOf`。现在取得的字节不能支持早于本次获取的冻结截点；也不能替代来源价格同期捕获。若主 Spec 对该材料要求不可变历史捕获，则本次还缺该证明，不得靠公告日回填获取时间。

可离线确定性重算的是原字节大小/摘要、固定定位及段落文本、证券代码、正文署名交易所、公告日、首次上市日。需要审查的信任/合同决定是官方原记录日级边界能否登记、原公告与当前托管副本之间的历史真实性，以及首次上市事件如何在不虚构持续有效性时满足实际 `symbolScope/date` 义务。

## 候选 B 的处理结论

原字节已完整保存。网页 PDF 阅读器显示封面上市地点、上市时间、公告日期，以及物理第 3、5 页的证券代码/交易所/日期一致。该阅读器的结果可帮助人工定位；本轮没有安装 Python/PDF 依赖，没有执行 PDF 文本解析器，现有 Python 环境中 `pypdf`、`PyPDF2`、`fitz` 均不可用。

本轮不建议直接登记 PDF parser：尚未建立固定 PDF 原字节到可重算文字的有界链，不能只 pin 一个手写提取文本摘要便声称离线重算 scope 和公开时间。若要推进它，需要单独资料/parser 叶固定当前 PDF 的对象、字体编码与文字提取关系，或另找满足同义务的官方原始结构化/HTML 发布记录；均需新预算与锁写，本任务不扩大为通用 HTML/PDF 系统。本次公告日也只证明材料载明的日期，缺精确公开时刻/完整持续有效历史范围的问题仍保留。

## 严格准入义务与剩余卡点

| 义务 | 本轮状态 | 阻塞原因 |
| --- | --- | --- |
| 真实独立证券身份/明确交易所原文 | 可复核原字节已取得 | A 与 B 均明确代码、场所和上市事件；须按不同发布主体登记 |
| A 原文事实固定 parser | 可设计，未实现/登记 | 提案限固定 159516 HTML，需实际受控验证 |
| B 原文事实固定 parser | blocked | 缺离线 PDF 提取闭合链 |
| 从原记录重算已批准公开边界 | blocked，待协调者判定 | 只有官方公告日；日级保守归一化及当前副本历史真实性尚未作为可信根批准 |
| 连续历史日期的证券场所有效范围 | blocked | 首次上市事件没有证明 2026 年持续有效范围，未取得完整变更/终止或范围声明 |
| 159516 的 XSHE 日历 | blocked | 现有 4.13.2 parser 仅 XSHG，不能继承 |
| XSHG 2026 标的场所绑定 | blocked | 588000 有首次上市原文，但 PDF parser 与 2026 范围未闭合 |
| 捕获时间与冻结截点 | 必须保留约束 | 本次获取发生于 `2026-09-27T17:34:24..25Z`；旧截点不能接受 |
| 完整 strict PIT ready / 真实运行 | 未执行且不得批准 | 场所、日期范围、公开边界、XSHE 日历和价格同期捕获是独立义务 |

不读取正在写入的 Schema。需协调者结合交付后的实际契约明确：官方日级公告原文的保守可见边界是否可登记、首次上市事件可授予的最小日期范围是什么、以及获取当前历史托管副本是否另需不可变捕获根。存在歧义时保留 unavailable，不自行把事件转成持续场所准入。

## 下一实施叶的精确写入范围与验证

若协调者先解决上述可信根及范围决定，可另锁以下新文件；本轮均未写入：

- `apps/server/src/market/market-pit-venue-szse-listing-notice-v1.ts`：单份固定深交所公告的原字节、发布记录与事件提取；输出事件事实，范围门禁保持失败关闭。
- `apps/server/test/market/market-pit-venue-szse-listing-notice-v1.test.ts`：受控正反例；不发网络。
- `apps/server/test/market/fixtures/pit-venue-szse-159516-20230724.raw.html`：从本文候选 A base64 解码取得的全部原字节，禁止重新排版或重抓替代。登记根与字段接缝文件只能在协调者另行锁写后指定；本轮不批准修改通用 schema/parser 登记表。

最少正例核对身份、署名、两处公告日期、首次上市日期和原摘要一致；若日级规则获得批准，则核对当地次日零时及精度标签。最少负例包括字节篡改后自报新摘要、错 URI/发布主体、站点 meta 名称冒充正文署名、重复/缺定位、改代码或上市日、坏 UTF-8、仅手填 normalized scope、未知 parser、公告日前可见、自报旧 acquiredAt、冻结截点早于获取、把 XSHE 绑定 XSHG 日历、将首次上市日扩为 2026 有效范围。生产缺充分证据时仍须 unavailable。

验证顺序是该 parser 定向离线检查，再 Market 场所/窗口门禁的受控集成，之后 Server 包级 typecheck/build 和仓库门禁。真实外部资料准入、目标执行日历、同期来源捕获和 PIT 完整运行分别保留真实验收；本轮没有执行这些步骤。

## 查询预算与完成检查

精确搜索共 4 条，预算 `4/4`；原文候选仅 A/B 两个，原 HTTP 请求均首次成功，重试 `0`。另用网页工具阅读同一候选 B 的 PDF定位，没有新增候选或失败重试。搜索返回的月报、第三方镜像及今日列表未作为来源准入，也未继续请求。预算结束后不再新增网络；没有 HiThink、BaoStock、Catalog 或 AI 请求。

两份候选原字节合计 446,976 字节，base64 合计 595,972 字符；全部封存在本文，未另写临时原文、源码或其他文档。说明性标题/正文为中文；链接、原始代码/配置键/元数据保留原文。最终离线核对 base64 解码长度与两份 SHA-256、文档空白及唯一产物；不运行测试。后续若要证明持续历史范围、处理 PDF 或新增资料，必须另立叶并给新边界，不能续用已耗尽的搜索预算。

## 本轮原字节捕获


### 候选 A 原字节

```json
{
  "candidate": "A",
  "uri": "https://www.szse.cn/disclosure/notice/fund/t20230724_602100.html",
  "finalUri": "https://www.szse.cn/disclosure/notice/fund/t20230724_602100.html",
  "status": 200,
  "contentType": "text/html",
  "bytes": 16126,
  "sha256": "cb3aabff8709091d9e534b5979e14bcbe3d825a51826aabf87c3a265b17751dc",
  "requestStartedAt": "2026-09-27T17:34:24.411815+00:00",
  "acquiredAt": "2026-09-27T17:34:24.777453+00:00",
  "httpDate": "Sun, 27 Sep 2026 17:34:25 GMT",
  "lastModified": "Sat, 30 May 2026 09:08:16 GMT",
  "locators": [
    {
      "term": "159516",
      "charOffset": 8927,
      "context": "yle=\"font-family: 宋体;\">国泰中证半导体材料设备主题交易型开放式指数证券投资基金（证券简称：半导体设备材料</span><span face=\"宋体\" style=\"font-family: 宋体;\">ETF，证券代码：159516)自2023</span></span><span style=\"mso-spacerun: 'yes'; font-family: 宋体; line-height: 200%; font-size: 12.0000pt; mso-font-kerning: 1.0000pt;\"><span face=\"宋体\" style=\"font-f"
    },
    {
      "term": "2023-07-24",
      "charOffset": 8235,
      "context": "h4>')\n                  \t\t\t}                  \t\t\n                  \t\t</script>\n              <div class=\"time\">时间：<span>2023-07-24</span></div>\n              <div class=\"des-switchsize\">\n                字体：\n                <span class=\"bigger\">大</span>\n                <span class=\"medium\">中</span>\n "
    },
    {
      "term": "深圳证券交易所",
      "charOffset": 974,
      "context": "name=\"author\" content=\"www.szse.cn\">\n<meta name=\"description\" content=\"深交所官网\">\n<meta name=\"keywords\" content=\"深交所,深交所官网,深圳证券交易所,交易所,交易所官网,深圳证券交易所官网\">\n<meta name=\"renderer\" content=webkit>\n<meta name=\"X-UA-Compatible\" content=\"IE=edge\">\n<meta name=\"google\" value=\"notranslate\"> \n<meta name=\"format-"
    },
    {
      "term": "深圳证券交易所",
      "charOffset": 992,
      "context": "ent=\"www.szse.cn\">\n<meta name=\"description\" content=\"深交所官网\">\n<meta name=\"keywords\" content=\"深交所,深交所官网,深圳证券交易所,交易所,交易所官网,深圳证券交易所官网\">\n<meta name=\"renderer\" content=webkit>\n<meta name=\"X-UA-Compatible\" content=\"IE=edge\">\n<meta name=\"google\" value=\"notranslate\"> \n<meta name=\"format-detection\" content"
    },
    {
      "term": "深圳证券交易所",
      "charOffset": 11281,
      "context": "ght: 200%;\"><span style=\"font-family: 宋体; line-height: 200%; font-size: 12pt;\"><span face=\"宋体\" style=\"font-family: 宋体;\">深圳证券交易所</span></span></p>\n<p class=\"MsoNormal\" align=\"right\" style=\"margin-right: 51.5000pt; mso-para-margin-right: 5.0000gd; text-autospace: ideograph-numeric; mso-pagination: "
    }
  ]
}
```

原字节采用独立 Base64 载体保存（见下方链接）；解码后的原字节才是摘要输入，不改变正文或换行。

[原始字节载体](2026-09-28-s05-venue-parser-discovery.cb3aabff.html.b64)（Base64；按本节既有长度与 SHA-256 校验解码结果）。

### 候选 B 原字节

```json
{
  "candidate": "B",
  "uri": "https://www.sse.com.cn/disclosure/fund/announcement/c/2020-11-11/588000_20201111_2.pdf",
  "finalUri": "https://www.sse.com.cn/disclosure/fund/announcement/c/2020-11-11/588000_20201111_2.pdf",
  "status": 200,
  "contentType": "application/pdf",
  "bytes": 430850,
  "sha256": "46af95b681fe58d9c409d2252be57404c5191fd2b678ba4a9781c588f852f2c3",
  "requestStartedAt": "2026-09-27T17:34:24.778340+00:00",
  "acquiredAt": "2026-09-27T17:34:25.182618+00:00",
  "httpDate": "Sun, 27 Sep 2026 17:34:24 GMT",
  "lastModified": "Fri, 18 Jul 2025 04:22:30 GMT"
}
```

原字节采用独立 Base64 载体保存（见下方链接）；解码后的原字节才是摘要输入，不改变正文或换行。

[原始字节载体](2026-09-28-s05-venue-parser-discovery.46af95b6.pdf.b64)（Base64；按本节既有长度与 SHA-256 校验解码结果）。

## 2026-10-14 载体整理说明

两份原件只从正文迁到独立载体，原 URL、响应元数据、字节长度、摘要及历史失败结论保持。Base64 换行不属于原件；解码后 HTML/PDF 的字节与原内嵌内容完全一致。该整理不恢复 S05 交付义务或补充历史可见性证明。
