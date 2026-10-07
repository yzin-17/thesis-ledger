# S05 日历原发布解析器与归档捕获记录发现

## 结论与边界

`S05-calendar-parser-discovery-0928 / worker_done`：已选出可实施的第一种真实资料解析器，定稿下述实施包。仅写本文；主 Spec、Task §12.8 台账和源码均只读，未读取同时修改的历史证据 Schema。基线为协调者指定的 `main / fe0e871e`，保留全部脏工作区。没有安装、测试、构建、数据库、Provider、运行态或部署操作。公开 PyPI JSON 与 wheel 只读获取到内存并过滤核验，未落盘。

第一种日历原证据为 `calendar-package-release`，登记 `pypi-exchange-calendars-4.13.2-xshg-v1`。发布者为 `PyPI / exchange_calendars` 包发布主体，交易所投影为 XSHG；不能将包发布者冒充交易所。只接受固定 4.13.2、固定源码树、2026 年 XSHG 的常规双时段投影。原始 JSON 提供保守公开可见边界，固定源码提供可复算的日期与时段；不接受自由填写的 `publishedAt` 或仅登记版本字符串。

证券场所绑定是独立的未解决依赖。该包只定义 XSHG 日历，没有证券名单或证券所属交易所映射，不能签发 `venueBindingEvidenceIds`。目标 `159516.SZ` 属于 XSHE，本解析器不能覆盖它，也不能凭“中国交易日通常一致”继承资格。当前可交付日历解析器和受控窗口核验；完整真实严格 PIT 必须在缺场所证据时保持 unavailable。

## 本轮核对的实际输入

| 输入 | 已核对事实 |
| --- | --- |
| [PyPI 固定版本原始 JSON](https://pypi.org/pypi/exchange-calendars/4.13.2/json) | 28,845 原始字节；本次完整字节 SHA-256 `38a86c1c1058cbaa84cb85ecafea74f9b19a7b87c10998a82f9df230bb52a87a`；`info.name=exchange_calendars`、`info.version=4.13.2` |
| [原始 wheel](https://files.pythonhosted.org/packages/c8/4c/0469b40057bc9f8d9594dcc6024202626b981ae4b52dfcd304552e8e1c3a/exchange_calendars-4.13.2-py3-none-any.whl) | 213,306 bytes；SHA-256 `fc5a2ad0d61b5c3a6539a3061cd4cbb55c59f4a903455cec7926e4b798919996`；上传时间 `2026-03-10T03:24:37.055242Z`；`yanked=false` |
| wheel 的 `exchange_calendars/**/*.py` | 93 文件、695,008 原字节；排序路径及各文件摘要形成源码树 SHA-256 `3dd6286cd2404bbe188e843a7ada5625164fff6059eb18c69d080213c3e29dea`，与既有 DSA 登记一致 |
| `exchange_calendars/exchange_calendar_xshg.py` | 14,758 bytes、647 行；SHA-256 `0450145f89c503f7311ebdabfa75177b21cd01aa5ec2dcc54cfc5a23f118336a`；605 个严格递增、无重复的假日日期；末条为 `2026-10-07` |
| `src/services/thesis_ledger_calendar_release.py:8-49` | 固定版本、93 文件及上述树摘要；公开可用边界与 wheel 一致；源码树计算规则为排序 `relativePath:sha256`，换行连接且末尾无换行 |
| `src/services/thesis_ledger_v2_dependencies.py:113-163` | 实际读取 `get_calendar("XSHG")` 的 schedule；工作日中不在 schedule 的日期形成 holidays；常规时段由包属性生成；`sessionOverrides=[]`；providerRevision 为 `exchange-calendars-4.13.2-release-evidence-v1` |
| 固定包 `precomputed_exchange_calendar.py:24-41` | 假日为明确 adhoc 列表，覆盖末年止于该年 12 月 31 日；XSHG 自身覆盖起点为 1990-12-03 |

PyPI 的固定版本接口及 `urls[].upload_time_iso_8601`、`digests.sha256`、文件 URL 的结构由 [PyPI JSON API 文档](https://docs.pypi.org/api/json/) 支持。元数据全文会因描述、所有者或漏洞信息变化而变化；上表完整原文摘要只登记本次捕获版本，不宣称该 HTTP 端点永不变化。下一叶若捕获不同原字节，须重新核对并登记，不能仅更新测试常量让新内容自动可信。

包内 2026 假日注释指向[上交所 2026 年部分节假日休市通知](https://www.sse.com.cn/disclosure/announcement/general/c/c_20251222_10802507.shtml)。本轮只读核对其日期为 2025-12-22、公告号为上证公告〔2025〕45号，清明节 4 月 4–6 日休市、4 月 7 日开市，中秋节 9 月 25–27 日休市、9 月 28 日开市。该网页是辅助交叉核对，未保存原 HTML 与摘要，不纳入第一种 parser，也不把日级网页日期转成更早的精确发布时刻。

## 固定发布 JSON 的小型解析合同

登记键包含解析器版本、元数据原字节摘要、固定 package/version、制品 URL/摘要/大小、源码树摘要/文件数和 XSHG 源码摘要。该登记是本轮公开输入核对后可供下一叶审查的明确可信根；包内调用者填写相同的 URL 或 publisher 本身不建立真实性。

1. `originUri` 只能为上表 PyPI 固定版本 URL；`publisher` 为登记值，`revision=4.13.2`，`parserVersion=pypi-exchange-calendars-4.13.2-xshg-v1`。其他 origin、版本、parser、证据种类均拒绝。不要解析任意 PyPI 项目或自动找最新版本。
2. 先检查 UTF-8 原字节长度和 SHA-256，再解析 JSON；必须与已登记原文摘要相等。拒绝 BOM、损坏 UTF-8、重复对象键、非 JSON、额外尾部文本。原发布记录含大量合法非核心字段，不将其机械改写为新自创 JSON 合同；真实性由全原文摘要固定，核心字段由解析器核对。
3. `info.name`、`info.version` 必须精确匹配登记。只选择唯一满足 `filename=exchange_calendars-4.13.2-py3-none-any.whl`、`packagetype=bdist_wheel`、`python_version=py3` 的 `urls` 项；重复匹配项拒绝，不按数组序号或最早上传项选择。sdist 的时间与摘要不替代 wheel。
4. 该项的 `digests.sha256`、`url`、`size=213306`、`yanked=false` 与登记逐项相同。定位固定为 `urls[filename=exchange_calendars-4.13.2-py3-none-any.whl].upload_time_iso_8601`，不能由调用者给出任意 JSON Pointer。
5. 只接受原始 `YYYY-MM-DDTHH:mm:ss.ffffffZ` 时间及精确登记值 `2026-03-10T03:24:37.055242Z`；输出保守 `knownAvailableAt` 为此值。比较时保留六位微秒，用整数微秒或等价无损比较，不通过 JavaScript 毫秒截断允许发布时间前的瞬间。`acquiredAt` 独立保存，必须不早于公开边界且不晚于冻结截点；它不取代公开时刻。

这一解析器证明的是被固定原 JSON 记载的制品公开时间。真实性根为公开获取后审查登记的原字节，离线解析不能证明 TLS 获取过程或未知发布资料；不宣称拥有 PyPI 数字签名或原交易所最早发布时点。

## 包原字节与投影的闭合绑定

只保存手写的 `sourceTreeHash` 或 `projectionHash` 不够。证据包必须保存 93 份源码的原字节、路径和各自摘要。原字节可沿用提案 `calendarArtifacts.files[].rawBase64`；无需在生产运行解析 ZIP、执行 Python、安装 pandas 或调用 DSA。

1. 仅允许登记源码集合：路径是 `exchange_calendars/` 下规范 POSIX 相对路径，全部 `.py`；拒绝绝对路径、`..`、反斜线、重复路径、缺文件和多文件。规范 base64 解码前后检查预算；逐文件重算摘要，然后重算完整树摘要，与登记树摘要相等。记录中的文件数量和版本字段不替代实际字节验证。
2. wheel SHA-256 到该 93 文件树的对应关系由本轮真实 wheel 解包核对后登记；在只保存源码文件的路线中，这是明确经过审核的固定映射，不能声称重新计算了 wheel ZIP 摘要。若未来需独立重验 ZIP 本身，须另存 wheel 原字节并另分叶实现有界 ZIP 验证，本叶不引入该框架。
3. 在完整树固定后，再对 XSHG 文件做有界、专用源码提取。数组边界只接受唯一的 `precomputed_shanghai_holidays = pd.to_datetime(`，紧接一份 `[`…`]` 字符串数组及 `)`。数组元素行只允许空白、注释和精确双引号 `YYYY-MM-DD` 及逗号，拒绝表达式、转义字符串、计算、拼接或动态调用。605 日期须为有效民用日期、严格递增、无重复；未知语法拒绝。不要用 `eval`、执行包代码或编写通用 Python parser。
4. 类名、父类、`name="XSHG"`、`ZoneInfo("Asia/Shanghai")` 和四个唯一 `((None, time(h,m)),)` 属性须匹配原源码。时间提取结果必须为 570、690、780、900 分钟。源文件完整摘要先匹配，因此提取器不承担任意 Python 语义解释职责；固定基础类和 weekday 语义属于经过审查的登记归一化规则。
5. 按连续民用日期复算：周六/日为 `closed/weekend`；其余日期若在解析出的假日集合中为 `closed/exchange-holiday`；否则为 `open/regular`、时段 `[570,690]` 与 `[780,900]`。休日空时段。逐日 `publicationIds` 必须引用实际固定发布记录。用户提交的 dateStates、reason、UTC 时段与这一结果逐字段完全相同才可绑定；篡改后重新计算投影摘要也不能放行。
6. 投影摘要应使用固定顺序数组的 UTF-8 JSON 编码，域前缀为归一化版本 `exchange-calendars-4.13.2-xshg-projection-v1`，包含 exchange、timezone、范围以及连续日期的状态、原因、全部分钟及 UTC 时段。`calendarContentHash` 另绑定 parser、原发布摘要、制品摘要、源码树、范围和投影摘要。字段/排序算法由下一叶统一固定并加受控向量，不靠对象插入顺序。

确定性复算项是原文/文件摘要、核心发布字段、假日列表、四个分钟常量、连续 dateStates、UTC 时段和投影摘要。信任项是本轮公开捕获后审核登记的原发布摘要、wheel 与源码树固定对应关系，以及固定包 weekday/adhoc 规则的语义解释。它们不得混写为“任意源码执行后证明”，也不得以部署哈希批准任意手填归一化投影。

## 时区、实际执行日历及范围

第一批只接受 `market=CN / exchange=XSHG / timezone=Asia/Shanghai`，民用日期范围限定 `2026-03-10` 至 `2026-12-31`，且各 Bar 的 decisionAt 仍必须不早于精确发布时间。此范围的登记 UTC 规则为 `Asia/Shanghai-2026-fixed-UTC+08-v1`；两段分别是当地当日 01:30–03:30Z、05:00–07:00Z。逐日 UTC 从日期和固定 +08 复算，不调用宿主当前 tzdb。首日公开时间晚于上午开盘，但早于当天最终收盘；不得因按日期裁剪而把时间边界回退到当天零时。

第一批不接收 HK/US、DST、半日、特殊开闭市、午夜跨日、歧义当地时间或其他时区规则；这些情况明确 unavailable，需要新的原证据与解析器叶。仅因 Schema 可表达这些形态，不意味着当前 parser 已支持。1990 年覆盖起点和历史假日列表不能让 2026 年制品支持早于公开日期的 PIT。

执行投影比较复用实际 `TradingCalendarFact`：要求 provider/revision 精确对应现有 DSA、timezone 相同、常规分钟相同、`sessionOverrides=[]`，范围覆盖预热/执行/最后后继日。按同一连续日期复算执行 fact 的 weekday/holidays 并逐日比较，拒绝额外、遗漏或范围外 holidays 和任何覆盖不足。即便 fact 的分钟与历史证据相同，也仍需独立场所核验；这里没有证明 XSHG 可当 XSHE 日历。最后一根必须在 2026-12-31 内有真实后继开盘，缺 successor 不补造 2027 日期。DSA 请求的未来范围预算仍是 104 个自然日，包最大范围不能绕过该运行入口限制。

## 首批 Server 捕获记录解析器

登记 `server-market-window-archive-capture-v1`，依据现有不可变窗口内容，不建立第二套价格记录。实际来源为 `MarketWindowEvidenceV3Repository.findFrozen(fingerprint)` 的成功结果；该方法已重算完整响应摘要、seriesVersion、身份指纹、请求/覆盖、来源价格事实与 policy revisions。`market-bar-reader-v3.ts:157-164` 的生产 `record` 调用没有传入 `fetchedAt`，repository 在 `:296` 生成真实 Server `new Date()`，重复身份返回原记录而不覆盖抓取时刻。

小型捕获记录只序列化实际已核验归档的 `{ windowIdentityFingerprint, completeResponseHash, fetchedAt }`，以固定键顺序形成 UTF-8 JSON 原字节。其 publisher 固定 `ThesisLedger Server`；内部 origin/locator 指向 `MarketBarWindowEvidenceV3/<fingerprint>#fetchedAt`，不是外部网页或新的 HTTP 存储。parser 解码后必须与输入的实际 bound archive 三字段精确相等，并重算记录原字节摘要；未知字段、重复键、缺归档、身份/内容/时间不符均拒绝。包内 receipt 不含 bars、priceBasis 或第二份价格事实；这些继续来自完整归档。内部定位只是可核验档案定位，不以 URI 字符串建立可信根。

该 JSON 是实际 Server 归档记录的有界捕获摘录，不是发行者发布公告，不新增可自报的“历史 publishedAt”。其 `knownAvailableAt` 等于实际 `fetchedAt`，仅表示 Server 已捕获内容的保守边界。来源 `observedAt`、revision 和全价格坐标从真实完整归档读取；不能以 receipt 的捕获时间代替来源观察时钟。后续窗口核验保持 `closedAt <= sourceObservedAt <= decisionAt` 与 `sourceObservedAt <= fetchedAt < nextOpenedAt`；允许 observed 后的真实传输延迟。若 sourceWitness 合同把 revisionKnownAvailableAt 用于来源观察界限，须明确派生自该归档的实际 `sourcePriceBasis.observedAt`，不是从自由 receipt 字段推导更早发布日期。

在线可信根是既有只读部署清单摘要加实际数据库归档，而非新 JSON 自证。冻结后同次封存完整 bound archive 和捕获摘录，离线重验二者的内容/时钟/摘要一致性。没有数字签名、不可篡改数据库或外部时间戳保证；有数据库写权的主体伪造旧 fetchedAt 不属于纯 parser 可解决的问题。repository 的测试接缝允许显式 fetchedAt，受控 fixture 必须标明这一点；不能把 synthetic archive 当真实历史捕获。现有旧记录缺完整响应时的补全路径也不能自动证明旧 fetchedAt 与新增响应同次采集，真实准入应审查捕获链来源；该问题保留真实验收。

## 场所证据依赖

`venueBindingEvidenceIds` 首批没有可登记的真实证券场所原资料 parser。本包、DSA 静态 instrument fact、请求 market、symbolScope、后缀或代码前缀均不足：后缀可以用于格式拒绝，不能成为独立发行者的场所映射证明。严格核验对缺该证据、未知 parser、所指原文不含精确证券/交易所或作用时间不覆盖时保持 `calendar-scope-mismatch` / unavailable。

安全的下一步是另分只读发现叶，选交易所官方证券名录或基金上市公告的确切原格式、发行者、证券标识、场所与适用时点，并登记原字节及 parser；对 159516 应选择深交所资料并另找 XSHE 日历原依据。本文未获取相关名录，不批准手工造出登记记录。受控测试可注入显式可信场所核验结果以验证窗口纯函数，但必须同时测试生产缺原资料时不能 ready，并披露受控测试不等于来源资格。

## 下一叶的独占实施包

| 叶 | 建议写入范围 | 交付与边界 |
| --- | --- | --- |
| 固定日历 parser | 新 `apps/server/src/market/market-pit-calendar-package-v1.ts`、新 `apps/server/test/market/market-pit-calendar-package-v1.test.ts`；确需受控原文时仅新 `apps/server/test/market/fixtures/pit-calendar-package-4.13.2.*` | 上述登记、字节树验证、专用源码提取、投影重算；无 DSA 修改、Python 执行、ZIP 框架或运行网络 |
| 日历/捕获核验接缝 | 新 `apps/server/src/market/market-pit-calendar-evidence-v3.ts`、新同名 Market test；必要的小型捕获解析 helper 可放同模块职责文件 | 调用固定 parser；捕获记录与真实 bound archive 比较；独立场所证据未实现时继续拒绝；实际执行 fact 比较可另叶由协调者锁写 |
| 场所与 XSHE 资料 | 当前 `blocked` 依赖，仅协调者另立调查叶 | 缺官方精确证券场所原资料和 XSHE 日历依据，不能扩大 XSHG 范围解决 |

不修改 `packages/schemas`、repository、预检、冻结或台账；协调者须在 Schema 交付后检查字段是否足够保存真实 metadata 原字节、93 文件及捕获摘录，再绑定实施叶。若总源码尺寸或职责需要分拆，按上述语义边界拆，不写通用 publication/PDF 框架。

## 受控正反例与验证顺序

正例使用下一叶实际获取并审核固定的 PyPI 原 JSON、93 原源码文件和受控同次 Server archive。日历范围 `2026-04-03..2026-04-07`：4 月 3 日开市，4–5 日周末，6 日假日，7 日开市；3 日 final close 为 `07:00Z`，下一有效 open 为 7 日 `01:30Z`。窗口受控价源观察可为 3 日 `07:00:01Z`、decision 为 `07:00:02Z`、Server fetched 为 `07:00:03Z`，验证合法传输延迟；完整价格来自既有 archive 而非 receipt。另用 `2026-03-10` 最终收盘验证发布时间当天资格，保留精确微秒前的拒绝；受控场所仅说明算法，不授予真实标的资格。

最少负例：

- metadata 原文一字节/日期修改并重新自报摘要；错 origin/version/wheel、sdist 代替、重复 wheel 项、伪造或毫秒截断发布时刻、损坏 UTF-8/重复 JSON 键/BOM、未知 parser。
- 缺/多/重复/越界路径、非规范 base64、任意单文件改变、仅树摘要无原字节、sourceTree 正确但手写投影删掉 4 月 6 日休市、篡改分钟/UTC 并重算 projectionHash。
- 日期不连续、特殊时段、US DST/跨午夜、错误时区、发布时间之前、早历史范围、超 2026 末日、最后 Bar 无 successor、实际执行 fact 的 holidays/sessionOverrides 不同。
- receipt 自报旧时间、抓取早于 observation、抓取等于/晚于下一开盘、完整响应摘要/身份不同、缺真实 archive、晚研究获取、只提供 URI/摘要或受控数据库 mock。
- 缺场所证据、`159516.SZ` 配 XSHG、symbolScope 或后缀自证、官方场所原文未知 parser；完整生产预检须继续 unavailable。

验证先 parser 定向测试，再相邻 Market 受控窗口与完整预检；通过后才做 Server typecheck/build 和仓库门禁。真实 PostgreSQL、目标 DSA 投影、证券原资料、同期来源捕获、严格 PIT 运行及离线封存重验仍各自开放，本轮没有执行上述验证。
