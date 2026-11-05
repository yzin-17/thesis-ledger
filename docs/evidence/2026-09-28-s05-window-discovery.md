# S05 独立历史决策窗口调查与实施边界

## 状态与权限

`S05-window-discovery-0928 / worker_done`：本叶完成有界只读调查和契约建议，不代表 S05 或严格 PIT 验收完成。源码基线为协调者提供的 `main / fe0e871e`，工作区已有 156 项修改、345 项未跟踪，保留全部既有工作。本叶仅新建本文，不修改 Spec、Task 台账、源码或其他代理产物，不运行测试、构建、数据库、Provider、网络或部署。

Context Mode 工具发现不可用；使用 RTK 和受限文件摘要调查。按 `spec-driven-workflow` 的有界调查、写入所有权和局部完成规则交接。下列合同是待协调者写入 Spec 的建议；依赖实现须等稳定合同确定后启动。

## 已核实事实

1. 主 Spec §6、AC12 要求 Market 掌握历史来源证据，不回填 `availableAt`，必要条件不得授予严格 PIT。现有 `market-pit-reconstruction-v3.ts` 只绑定输入；内容函数返回 `archives-bound`；来源时钟函数只返回 `source-times-bound`。
2. 来源时钟函数同时核对归档全部 Bar 不晚于观察时点、Server 抓取不早于观察、逐 Bar 观察不晚于该 Bar 的 `availableAt`。因此它不是独立日历窗口，也没有证明供应商修订在原历史时点已存在。整窗研究时晚可见的反例已经保留在现有测试中。
3. `MarketPitReconstructionRepository` 用只读文件及 `MARKET_PIT_RECONSTRUCTION_SHA256` 绑定完整 UTF-8 原文，最多 32 MiB；没有 HTTP 写入，也不缓存撤销。可沿用这一信任入口，但不能把“文件摘要一致”解释为“原始发布时间真实”。
4. `backtestHistoricalExecutionPreflightFailureV3` 在必要条件通过后固定返回 `DATA_UNAVAILABLE / historicalDecisionWindow`。V3 构建器在 `startBuild` 和 Artifact 写入前调用该函数，但 finalized 快照会先直接 `snapshots.replay`。
5. `LocalSnapshotV3Store.finalize` 与 `replay` 都调用 `validateInputs`；这是新冻结和既有 finalized V3 离线重验的共同接缝。当前执行证据 Artifact 保存窗口引用、请求、价格事实及时间，却未封存独立历史窗口和重建所用完整原文/归档。
6. `TradingCalendarFact` 只有市场、时区、供应商、修订、`availableAt`、常规时段、例外时段、假日及范围；无交易所身份、原发布文档和部署摘要绑定。`tradingCalendarFromFact` 可用于执行计算，不能独立签发历史可见性。
7. Domain 内置日历覆盖 2025/2026，含 CN/HK/US 时段及部分特殊收盘；不属于原历史发布证据。历史窗口 verifier 不得默认使用它，也不得借价格 `coverageProof` 的交易日列表补齐日历。
8. `backtest-daily-bar-session.ts` 已有按日线标签求开闭市时刻的算法；Domain `backtest-data.ts` 的 `utcForLocalMinute` 是私有分钟聚合辅助函数。前者属于 Backtest，Market 不能反向导入；后者不能直接视为历史时区、午夜跨日或歧义时刻的完备证明。
9. R01.10 当前登记 `exchange-calendars 4.13.2`：93 份源码树摘要 `3dd6286cd2404bbe188e843a7ada5625164fff6059eb18c69d080213c3e29dea`，公开制品时间 `2026-03-10T03:24:37.055242Z`。这只提供该制品公开可用的保守边界，不是每条历史公告的最早发布时刻；不能支持更早 Bar 的逐日历史日历资格。该事实依据现有日历 Spec 和 DSA 发布核验源码读取，本叶未重新访问上游或运行容器。

调查入口：主 Spec §6、§12 AC12/AC15；`2026-09-28-s05-reconstruction-guards.md`；主 Task §12.8；下文路径表中的实际源码；`docs/specs/2026-09-27-calendar-release-availability.md` 和 DSA `src/services/thesis_ledger_calendar_release.py`。

## 建议稳定合同

### 身份、文件与版本

在现有部署固定的重建清单 v2 内增加独立 `historicalDecisionWindow` 证据区，含日历原始证据、来源修订历史见证及归一化投影。复用现有绝对只读路径与 `MARKET_PIT_RECONSTRUCTION_SHA256`，不新增第二套部署证据系统或配置。独立指证据来源与价格响应相互独立，不要求另建清单仓库。禁止客户端上传或填写时间后直接取得资格。摘要仍计算完整原始 UTF-8 字节，格式化、BOM、字段顺序改变均为新身份。

已有 `market-pit-reconstruction` 清单 v1 保留原解码及必要条件语义。新增清单 v2，保留原精确标的、RouteKey、目标、窗口、序列版本、输入指纹、完整价格坐标、`dataAsOf`、逐 Bar 归档引用，增加 `historicalDecisionWindow`。推荐保留既有 `market-pit-proof-v1:<sha256>` 作为部署文件引用外壳，解析后的 `contractVersion` 决定清单语义；引用前缀版本与文件合同版本不混用。

包内每个记录都有 `id` 和内容摘要；摘要对象包括版本、交易所、时区、作用域、证据原文摘要、投影摘要和解析器版本，不含本机路径。所有引用必须唯一可解析，重复身份、冲突摘要、未知额外字段、未经登记的解析器一律不可用。文件大小、记录数、每条原文长度、日期跨度、总展开天数均有显式上限；建议沿用 32 MiB 总文件上限、10 万 Bar 上限，新增日期展开上限 10 万天并在读取/展开前拒绝超限。最终上限必须进入 Schema 与 repository 一致的常量合同。

### 独立日历证据

每份日历记录至少含：

| 字段 | 约束与含义 |
| --- | --- |
| `id / calendarContentHash / projectionHash` | 对原证据、归一化时段与解析器的内容身份，不以版本字符串代替摘要 |
| `market / exchange / timezone / symbolScope` | 实际交易所及 IANA 时区；精确标的或已审核标的范围；`CN` 不能独自证明 XSHG、XSHE、XBSE 通用 |
| `venueBindingEvidenceIds` | 标的所属交易所的独立证据；不得仅用价格响应的市场标签推断交易所 |
| `historicalRange: { start, end }` | 证据明确覆盖的当地日期范围，包含预热、全部输入 Bar、最后 Bar 后的真实后继开盘及中间所有日期 |
| `dateStates[]` | 连续日期投影；每一天明确 `open/closed`，完整有序时段或休市原因，引用支持该状态的原文；未列日期为未知，不按默认周末/工作日推断 |
| `publications[]` | 发布者、官方原始 URI、原文 UTF-8 或有界二进制编码、字节摘要、原文版本、发布时间的可核验定位、解析器版本；时间由登记解析器从原证据核对 |
| `calendarArtifact` | 使用公开包分支时保存制品 SHA-256、版本、文件集合/源码树摘要及用来核验投影的原字节；仅提供手写摘要清单不足 |
| `knownAvailableAt` | 从独立原发布证据得出的保守边界；不得从请求起日、Bar 时间、研究抓取日期、范围起点推导 |
| `acquiredAt` | 本次证据获取时间，独立保留；不冒充历史发布时间 |
| `normalizationVersion / timezoneRulesIdentity` | 日历归一化及时区规则身份；冻结投影同时携带解析出的 UTC 时段，离线重验不静默换用新宿主时区规则 |

时段必须开始早于结束、严格排序、无重叠；空时段只属于明确休市日。日线完整收盘为当天最后有效时段结束；次开盘为之后最早有效交易日第一个执行时段开始。午休不是日线后继开盘；半日、临时休市和跨 DST 的下一开盘按实际证据计算。首批建议限制“当地日内时段、CN/HK/US 日线”模型；跨午夜或时间映射不唯一的时段拒绝，未来另扩合同，不能凑出 UTC 时间。

若采用公开包证据，整个包的公开可用时间是它所有投影的保守可见边界。日历历史覆盖日期早于发布日期，不代表投影在那些日期已可见。支持更早 PIT 必须增加历史发布版本或原历史公告证据；一份当代包不能给过去所有日期自动授予资格。

临时更改应按版本形成独立日历记录。某 Bar 的最终实际后继开盘与当时已公布的安排若不同，必须有更改公告及对应生效/可见时点；无法在该 Bar 的历史决策截点证明实际安排时保持不可用，不以今日最终日历覆盖当时知识状态。

### 来源修订历史见证

日历窗口不能单独证明某个复权版本历史存在。每个逐 Bar 绑定仍必须引用 `sourceWitness`：不可变归档身份、完整响应摘要、原始发布/捕获证据及保守 `revisionKnownAvailableAt`。精确目标、RouteKey、标的、完整 `sourcePriceBasis`、供应商修订、序列版本、请求窗口与来源观察时间从已有完整归档读取并核对，不重复建立平行价格事实。`request-window` 仍要求请求窗口一致。

首批可接受实际 Server 在该历史窗口内捕获的不可变归档，并以部署审核包绑定当时采集证据；其原始 Server `fetchedAt` 必须在下一有效开盘之前且不晚于 `dataAsOf`。研究时新抓取的旧数据不能用自报 `observedAt` 抵消晚到的实际 `fetchedAt`。允许来源观察后因传输稍晚抓取，绝不要求两者相等。发布记录只证明版本存在，仍须绑定实际完整响应与价格事实。

若要允许“现在从外部历史档案再获取”，必须另设登记过的外部不可变历史捕获证据种类，证明原始历史捕获时间和内容身份；本次获取时间单独保留。该扩展不属于首批允许种类，不能靠包内自由文本的历史时间解锁。

### 逐 Bar 最终窗口

v2 清单中的 `barDecisionBindings[]` 与输入 Bar 同序、同数量、无重复，至少包括 `timestamp / windowIdentityFingerprint / completeResponseHash / calendarEvidenceId / sourceWitnessId / tradingDate / decisionAt / closedAt / nextTradingDate / nextOpenedAt`。时间字段是待复算结果，不是免检证明；`decisionAt` 必须等于未改写的输入 Bar `availableAt`，不由客户端选择、不回填。

建议首批采取以下默认边界，供协调者直接写回 Spec：

1. 独立复算 `closedAt <= decisionAt < nextOpenedAt`；真实完整收盘时刻纳入左边界，下一有效开盘排除。收盘相等只在独立日历真实收盘、输入/归档均 `complete` 且历史来源见证全部成立时接受；这保留既有收盘信号语义，不能靠“等于收盘”替代完成证明。最后一根 Bar 同样必须找到后继开盘，不能使用下一根输入 Bar 或窗口右边界代替。
2. 归档全部内容和本次输入先通过既有内容/来源时钟门禁；再验证原证据 `revisionKnownAvailableAt <= decisionAt`、日历及标的交易所证据 `knownAvailableAt <= decisionAt`、`sourceObservedAt <= decisionAt`，所有用于该决策的事实不得晚于它。
3. 原始历史捕获的 Server `fetchedAt >= sourceObservedAt` 且 `fetchedAt < nextOpenedAt`；稍晚传输允许，但跨下一开盘或研究时才采集拒绝。这里证明该版本在原历史窗口内实际被捕获，并不声称模拟系统在 `decisionAt` 已收到该响应；若产品需要证明实时可执行延迟，须另立 `fetchedAt <= decisionAt` 的更强规则。
4. `decisionAt`、来源观察、采集、证据获取/已公开事实均受 `dataAsOf` 截点；已知且早先公布的下一开盘可以晚于 `dataAsOf`，不能把下一开盘自身错误当作已发生行情。不得要求 successor 价格 Bar 存在。
5. 日历与来源历史见证必须匹配部署 pin、解析器和精确作用域。与冻结执行日历在相同日期的时区、交易所、开闭市及特殊时段不一致时拒绝；不能让独立证明日历与实际执行日历各跑一套。

最终结果建议为 `historical-window-bound`，携带现有清单完整原字节/摘要（已含历史证据区）、完整去重归档、来源时钟绑定、复算的逐 Bar 窗口。只有这一最终结果可供严格历史资格预检通过；v1 或缺独立证据继续返回明确的 `DATA_UNAVAILABLE`。固定快照和 V2 保持既有语义。

## 推荐默认决策与业务限制

推荐采用以下默认值；协调者应先写回 Spec，再发依赖叶子。无需继续让实现者选择：

- 收盘相等边界：采用 `closedAt <= decisionAt < nextOpenedAt`，收盘边界结合独立真实完整收盘证据接受；与既有收盘信号模拟语义一致。
- 接收延迟：采用 `closedAt <= sourceObservedAt <= decisionAt < nextOpenedAt`、`sourceObservedAt <= fetchedAt < nextOpenedAt`；观察或抓取恰好下一开盘均拒绝。保留同一窗口内稍晚传输；PIT 证明来源历史可见性，执行系统的接收延迟不是本次新增保证。不得将 `fetchedAt` 改写为观察或决策时间。
- 运行日历一致性：严格创建必须拿到实际冻结执行日历，并与证据投影在预热/执行/后继日期上的交易所、时区、开闭市、全部特殊时段和 UTC 时刻逐项相等；缺实际日历或差异拒绝。日历“历史可见性证明”和“当前执行读取版本”可以是不同发布版本，但其用于本次模拟的投影必须一致；不能为了发布时间一致而重写事实。先完成来源资格，再在完整依赖预检/冻结层核对运行日历；单独执行行情预检通过不等于完整运行 ready。
- 旧 V3 与 AC15：默认严格旧 V3 缺最终证据阻断执行/重试，仍可读取元数据和原字节，不能伪造补证或回写身份。AC15“旧快照可读可重放”与这一新增严格校验存在字面张力，协调者须明确旧严格 V3 的安全限制；V1/V2 与旧固定 V3 的原有可重放保证完整保留。需要补证时只新建有独立身份的快照，绝不修改旧 finalized 内容。
- 首批真实来源的证据准入：需要指定可审核的原日历发布记录、真实交易所范围及真实归档捕获证据。部署 digest 是信任入口；原文应确实来自登记发布者/历史采集，而不是由业务请求临时自签。没有真实材料时可以完成失败关闭的实现，不能宣称 PIT 已可运行。

## 建议 Schema 字段、返回值和消费签名

新增 `marketPitHistoricalDecisionWindowV3Schema`；首批明确字段如下，均使用 strict object，有界数组/文本，时间使用带 offset 的 ISO timestamp，摘要使用 64 位小写 SHA-256：

```ts
type HistoricalDecisionWindowV3 = {
  contractVersion: 1;
  kind: 'market-pit-historical-decision-window';
  calendars: Array<{
    id: string;
    calendarContentHash: string;
    projectionHash: string;
    market: 'CN' | 'HK' | 'US';
    exchange: string;
    timezone: string;
    symbolScope: string[];
    venueBindingEvidenceIds: string[];
    historicalRange: { start: string; end: string };
    knownAvailableAt: string;
    acquiredAt: string;
    normalizationVersion: string;
    timezoneRulesIdentity: string;
    dateStates: Array<{
      date: string;
      status: 'open' | 'closed';
      reason: 'regular' | 'weekend' | 'exchange-holiday' | 'special-session';
      publicationIds: string[];
      sessions: Array<{
        startMinute: number;
        endMinute: number;
        openedAt: string;
        closedAt: string;
      }>;
    }>;
    publicationIds: string[];
    calendarArtifactId?: string;
  }>;
  originalEvidence: Array<{
    id: string;
    kind: 'exchange-publication' | 'calendar-package-release' | 'server-archive-capture';
    publisher: string;
    originUri: string;
    revision: string;
    parserVersion: string;
    raw: { encoding: 'utf8' | 'base64'; bytes: string; sha256: string };
    // 定位由登记 parser 定义的机器可核验路径，不接受任意自由文本证明。
    publicationLocator: string;
    knownAvailableAt: string;
    acquiredAt: string;
  }>;
  calendarArtifacts: Array<{
    id: string;
    version: string;
    artifactSha256: string;
    sourceTreeHash: string;
    publicationId: string;
    files: Array<{ relativePath: string; rawBase64: string; sha256: string }>;
  }>;
  sourceWitnesses: Array<{
    id: string;
    windowIdentityFingerprint: string;
    completeResponseHash: string;
    captureEvidenceId: string;
    revisionPublicationIds: string[];
    revisionKnownAvailableAt: string;
  }>;
  barDecisionBindings: Array<{
    timestamp: string;
    windowIdentityFingerprint: string;
    completeResponseHash: string;
    calendarEvidenceId: string;
    sourceWitnessId: string;
    tradingDate: string;
    decisionAt: string;
    closedAt: string;
    nextTradingDate: string;
    nextOpenedAt: string;
  }>;
};
```

v2 重建清单只新增必需 `historicalDecisionWindow: HistoricalDecisionWindowV3`，其余字段沿用现有 v1。`calendarArtifacts` 可为空（使用原交易所公告分支）；若 `calendarArtifactId` 存在则必须引用真实记录。`sourceWitnesses` 只绑定既有完整归档，完整价格坐标由归档与顶层清单核对，不重复复制。三种原文种类只是可支持集合，实际实现只允许明确登记且已实现的 parser；未实现种类保持不可用。

```ts
// Market 所有，纯验证，不读部署文件、DB 或 Provider。
verifyMarketPitDecisionWindowsV3(input: {
  content: Extract<MarketPitArchiveContentResultV3, { status: 'archives-bound' }>;
  sourceTimeBindings: readonly MarketPitSourceTimeBindingV3[];
  historicalDecisionWindow: HistoricalDecisionWindowV3;
}):
  | { status: 'historical-window-bound'; decisionWindows: VerifiedDecisionWindowV3[] }
  | { status: 'unavailable'; reason: HistoricalDecisionWindowFailureReasonV3 };

// 实际 repository 读取同一个部署固定清单与既有 findFrozen 归档。
MarketPitReconstructionRepository.bindHistoricalWindow(
  input: MarketPitReconstructionInputV3,
  reconstructionRef: string,
): Promise<MarketPitHistoricalBindingResultV3 | null>;

// 最终成功对象继承当前 bindSourceTimes 已返回的完整内容。
type MarketPitHistoricalBindingResultV3 =
  | (Omit<BoundSourceTimesContentV3, 'status'> & {
      status: 'historical-window-bound';
      decisionWindows: VerifiedDecisionWindowV3[];
    })
  | { status: 'unavailable'; reason: HistoricalDecisionWindowFailureReasonV3 };

// Backtest 消费已核验结果，固定快照返回 not-required。
backtestHistoricalExecutionPreflightV3(
  input: MarketPitReconstructionInputV3,
  runConfig: RunConfigV3,
  reconstruction?: Pick<MarketPitReconstructionRepository, 'bindHistoricalWindow'>,
): Promise<
  | { status: 'verified'; evidence: Extract<MarketPitHistoricalBindingResultV3,
        { status: 'historical-window-bound' }> }
  | { status: 'not-required' }
  | { status: 'unavailable'; failure: HistoryInputFailureV3 }
>;
```

`BoundSourceTimesContentV3` 是现有 `bindSourceTimes` 成功结构的命名类型：包含 proof、完整 archives、sourceTimeBindings、reconstructionRef、manifestText、manifestHash；不新建证据事实。`VerifiedDecisionWindowV3` 包含已经复算的逐 Bar 字段及所用日历/来源证据 id。失败 reason 最少包括 `historical-evidence-missing / invalid-publication / unsupported-evidence-kind / calendar-scope-mismatch / calendar-horizon-unavailable / calendar-range-incomplete / missing-successor / historical-source-late / historical-revision-unavailable / outside-decision-window / execution-calendar-mismatch`，消费层继续映射到稳定 `DATA_UNAVAILABLE` 和具体缺字段。

现有 `backtestHistoricalExecutionPreflightFailureV3` 保留适配签名，用新函数结果映射失败；生产行情预检可沿用适配层。Snapshot 构建使用新函数携带的成功 evidence 封存，避免“预检只返回 null 然后再次读取得到不同证据”。冻结完成实际依赖采集后，以新纯函数 `assertPitExecutionCalendarAlignmentV3(evidence, executionCalendar: TradingCalendarFact): void` 比较真实执行投影；此函数属于 Backtest 冻结/离线验证接缝，Market 仍不反向依赖 Backtest。

已有 `backtest-preflight-v3-execution.ts` 只在执行行情环节消费历史失败；完整依赖闭包预检仍必须完成相同日历比较才能整体 ready。若该完整预检接缝尚未提供实际日历，需追加一个有明确文件集合的日历一致性消费叶，不能用新增历史资格结果直接宣称全依赖 ready。

## 接缝与建议独占写入边界

下列是建议叶子，不是本叶已执行的变更。共享导出由协调者在边界集成时独占；协调者已锁定 ratchet：builder 388 行、Store 293 行、Schema `backtest-data.ts` 653 行不得增长。新职责放入表中专属语义模块，既有文件只接线并收敛原职责，不能持续追加；本建议不修改 `backtest-data.ts`。

| 叶子与前置 | 精确建议写入集合 | 单一交付与定向检查 |
| --- | --- | --- |
| `S05-window-schema`；Spec 决策完成 | 新 `packages/schemas/src/market-pit-historical-evidence-v1.ts`、新 `packages/schemas/test/market-pit-historical-evidence-v1.test.ts`；修改 `packages/schemas/src/market-pit-reconstruction-v3.ts` 及其 test | 有界原文/摘要、连续日期、时段、来源见证、v2 绑定合同；未知字段/冲突/超限/缺 successor 拒绝，v1 保留必要条件解码。`packages/schemas/src/index.ts` 由协调者单独集成 |
| `S05-window-calendar`；schema | 新 `apps/server/src/market/market-pit-calendar-evidence-v3.ts`、新同名 Market test | 已登记证据种类的原发布内容/修订/投影/时区核验，明确日历可见 horizon；未知 parser、伪造发布时点、错交易所、DST、半日、临时休市、午夜/歧义与晚发布拒绝。仅实现最先登记的一种证据解析器；新增独立种类需新叶子 |
| `S05-window-bind`；calendar | 新 `apps/server/src/market/market-pit-decision-window-v3.ts`、新同名 Market test | 纯函数消费真实内容/来源时钟/日历包，复算逐 Bar 窗口及来源修订见证；含最后 Bar successor、午休、连假、跨年、晚研究获取、自报时间、跨下一开盘抓取的反例。不导入 Backtest、不读文件或数据库 |
| `S05-window-repository`；bind | 修改 `apps/server/src/market/market-pit-reconstruction.repository.ts` 及 `apps/server/test/market/market-pit-reconstruction.repository.test.ts` | 复用现有成对路径/digest、只读有界读、精确 v2 查找及最终结果；损坏 UTF-8、错摘要、非普通文件、撤销、替换和读取失败全部拒绝。沿用现有注入，无需新增配置、HTTP 或数据库；如文件职责超过 ratchet，再提取同模块只读文件 helper |
| `S05-window-preflight`；repository | 修改 `apps/server/src/backtest/backtest-reconstruction-preflight-v3.ts`、`apps/server/test/backtest/backtest-reconstruction-preflight-v3.test.ts`；必要的实际完整预检 test 由协调者锁定具体文件 | 仅最终状态可 ready；必要状态继续缺字段失败，固定快照不读重建包，未来数据优先失败；生产端口用实际 repository 类型，不能仅测试自报 ready mock |
| `S05-window-freeze`；preflight | 新 `apps/server/src/backtest/backtest-snapshot-v3-reconstruction-evidence.ts`、新 `apps/server/test/backtest/backtest-snapshot-v3-reconstruction-evidence.test.ts`；修改 `apps/server/src/backtest/backtest-snapshot-v3-builder.ts`、`apps/server/test/backtest/v3-snapshot-builder.test.ts` | 构建只消费一次已核验且完整返回的证据区，比较实际执行日历，封存全部原文/归档及复算结果；写入前失败不能 `startBuild`。冻结数据与门禁结果来自同次捕获，防检查后文件替换；默认 finalize 前重查现有清单 pin/存在性，变化则失败 |
| `S05-window-offline`；freeze | 新 `apps/server/src/backtest/backtest-snapshot-v3-reconstruction-validation.ts`、新同名 Backtest test；修改 `apps/server/src/backtest/backtest-snapshot-v3-store.ts` | 从内容哈希 Artifact 重建 Market 输入并重跑相同 verifier；finalize/replay 共同接线，含旧 finalized 严格 V3 缺证据、字段/原文字节/归档篡改拒绝；环境删除部署文件、停 Provider 后仍可对完整冻结证据重验，不访问在线仓库 |

建议 Artifact：`metadata/pit-reconstruction-evidence-v3.parquet` 保存一个有明确版本的完整证据 envelope；较大原文/归档可拆为按摘要身份引用的多行，但须声明数量与总字节上限，并确保全被 manifest contentHash 覆盖。封存不只保存 `historical-window-bound` 布尔值或计算结果，也不只保存摘要引用。无需扩展 `backtest-data.ts` 的普通日历事实或 V2 manifest；如需要新增 V3 manifest 专用引用，由 schema 叶子先拥有契约，再由协调者集成，不由 freeze 临时加字段。

Market 验证代码始终由 Backtest 单向消费。若新增跨层 import/export，同步维护 `scripts/check-boundaries.mjs`；已有禁止 Market 反向依赖 Backtest 的门禁必须保留。为重用时区转换而引入稳定领域原语属于独立小叶，只有窗口叶证明有实际跨调用者需求后才启动，不能为省 import 随意搬 Backtest 适配器。

## 验证与真实门禁

每叶先运行自己的定向 Vitest，再由协调者对整合同一输入版本执行 Schemas/Server 类型与 build、边界/依赖/复杂度/文件尺寸及 diff check。不因每叶完成而重复完整构建或部署。新增测试应证明历史资格和失败关闭，不只镜像 schema 字段。

真实审核证据生产、部署挂载、真实日历/归档、合格 PIT 新快照冻结、Worker/离线重验、旧版本回归应作为明确独立验收阶段；应用/配置源码稳定后按 infra 官方入口选择同步或完整更新。原始采集发生在已结束历史窗口的事实无法通过现在重新抓取来补做。R01.10 的当前日历发布证明不能替代这些来源、范围与逐 Bar 时间门禁。

本叶没有执行上述测试或运行态验证；已有报告的 214 项与目标探针证据只覆盖必要条件。本提案不重新运行已耗尽预算的数据库/来源/浏览器检查，也不将其改记通过。

## 交接检查点

- 输出：仅本文；未 stage、commit、清理或修改其他产物，无后台进程。
- 已定事实：日历和来源修订独立核验，精确交易所/时区/发布 horizon，最后 Bar 的 successor，完整封存，Store finalize/replay 统一离线门禁，V2 保留。
- 规划结论：剩余实现分为上述七个单一交付叶子；不能把 Market 证据核验、文件供给、新快照和旧快照重验派成一个任务。
- 推荐默认：包含真实完整收盘、排除下一开盘；来源观察与抓取必须都在原窗口中，允许稍晚传输；独立证据与实际冻结执行日历投影一致；旧严格 V3 缺证据阻断执行，保留元数据读取及 V2/固定 V3 重放。
- 待协调者：将推荐默认及旧严格 V3/AC15 安全限制写回权威 Spec/Task；锁定首种真实证据解析器和发行材料。完整依赖预检若缺实际日历比较接缝，单独派发该消费叶。
- 本地实现前沿：契约决策完成后 schema；真实资料缺失不妨碍失败关闭的本地实现，但阻断合格 PIT 来源与运行态验收。
