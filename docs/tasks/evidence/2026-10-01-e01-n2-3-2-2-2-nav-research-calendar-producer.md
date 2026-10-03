# E01-N2.3.2.2.2 研究日期生产验收

## 授权口径与范围

2026-10-01，用户在核查东方财富、基金公司与 HiThink 能力后确认采用现有来源共同提供的历史净值日期和单位净值。Spec 已先更新：实际返回日期作为估值日，与已核验 XSHG 交易日相交作为研究申赎日，XSHG 作为披露工作日假设；缺日不交易。历史暂停、限购及投资者/渠道差异不纳入本版模拟。严格模式仍要求独立日期与真实发布时间，不能使用研究日期替代。

本叶完成研究日期生产器、来源证据复核、日历制品核验、严格模式隔离与现行 Server 日期计划交叉验证。原独立完整基金日历义务按用户决定收窄为上述研究合同，不宣称原严格日历验收通过。N2.3.2.3 的精确 API、来源准入及后续冻结、Worker、目标运行态继续未完成。

## 实现与证据绑定

- DSA `data_provider/eastmoney_nav_evidence.py` 新增来源包复核：原响应页序/摘要/总量/页长度、逐条原生记录与投影、唯一日期及整批摘要重新校验；沿用每页 4 MiB、整批 32 MiB、最多 100 页/100000 条约束。不能只改投影日期而保留原页摘要。
- `src/services/thesis_ledger_nav_calendar_source.py` 复用已核验 `exchange_calendars=4.13.2` 的 93 份源码制品身份及发布可用时刻，只读取 XSHG 覆盖内工作日，制品未知、改变或晚于冻结时点拒绝。
- `src/services/thesis_ledger_nav_calendar.py` 只接受显式研究模式、用户日期决策原文、精确来源包、基金规则及有界预热/尾部预算。规则、来源、决策标的与原文摘要绑定，配置、来源采集、规则采集和本次生产时刻均不得晚于 `dataAsOf`。
- `valuationDates` 保留来源中的非沪深交易日净值；`tradingDates` 只取其与 XSHG 的交集，缺净值日不会进入处理集合；`disclosureWorkDates` 独立使用 XSHG 工作日。T+n 从估值日后开始计数，披露日结束后的上海次日零点作为研究可见时间。
- 日期包不可变，返回日期原文、假设证据原文、用户决策原文及真实生产时刻；日期投影每次生成新对象。假设证据摘要绑定来源整批摘要及修订、规则摘要、用户决策摘要、XSHG 制品身份和发布时刻、三个集合的构造口径以及未模拟的限制。
- 日期版本 `nav-research-calendar-v1:<假设摘要>` 与 `research-config://nav-calendar/<假设摘要>` 对应。`coverage.complete=true` 表示声明范围内按已授权规则构造完整，不证明真实开放或独立历史完整。后续精确 API 必须随来源响应冻结假设和决策原文，并复核此关联。
- 主仓日期计划守卫显式接收可见性模式；研究版本或研究引用进入严格模式时拒绝，摘要与引用不一致时拒绝。原研究可见性计算、预热与确认/结算预算函数继续使用当前合同。

预热按实际净值记录倒推，来源空、记录不足或请求超规则范围拒绝。申赎尾部只使用实际已有净值与 XSHG 的交集，最多检查结束日后 104 个自然日；尾部不足不借未来净值补齐。披露工作日或实际冻结前可见性不足同样拒绝。

## 真实来源与 Server 接缝

运行窗口为 2026-09-08 至 2026-09-15，预热 4 条。确认/结算预算从现行 NAV 模型取 `1 + 1 + max(1,2) = 4` 个处理日。探针首轮读取生产东方财富原文 Reader、官方 QDII PDF 规则和核验过的真实 XSHG 制品，内部无重试；未替换生产来源或日历实现。

冻结核对时点显式为 `2026-09-30T16:24:12.954651+00:00`（上海 2026-10-01 00:24:12.954651），探针开始时预留 60 秒取得证据，所有实际采集/生产时刻均早于该时点。收益区间仍止于 09-15；后续尾部日期不扩展收益区间。

| 标的 | 来源条数/页数 | 规则延迟 | 估值/处理/披露日期数 | 日期覆盖 |
| --- | --- | --- | --- | --- |
| 110011.OF | 4410 / 5 | T+1 | 14 / 14 / 14 | 2026-09-02 至 2026-09-21 |
| 118001.OF | 3900 / 4 | T+2 | 14 / 14 / 14 | 2026-09-02 至 2026-09-21 |

两只基金预热日期均为 09-02、03、04、07；执行净值日期均为 09-08、09、10、11、14、15；处理尾部均为 09-16、17、18、21。真实样本中三集合恰好相同，受控缺日与周六估值测试证明生产逻辑仍分别构造。118001 的 09-07 有净值并进入研究处理集合，这不声称该日真实开放；前次官方状态实测该日暂停的证据继续保留。

| 标的 | UTC 来源采集时刻 | UTC 日期生产时刻 | 日期原文 SHA-256 | 假设证据 SHA-256 |
| --- | --- | --- | --- | --- |
| 110011.OF | `2026-09-30T16:23:14.634456+00:00` | `2026-09-30T16:23:14.876543+00:00` | `8d8ef0d483bfc4d0ee9d137a04f69f3d65b90635f5e6a666f53bba7a050c2e03` | `d5c9d85ad6ce212ab0247935a8fb49063d8fb085e3a2985813593a846a0b3307` |
| 118001.OF | `2026-09-30T16:23:16.240288+00:00` | `2026-09-30T16:23:16.419713+00:00` | `5f066a723ec65b85a3e7959564eacce1a071c37dd115f081eb95ed8a2fb595a0` | `3928fd7e2816fb4cdb730e9dcacdbdda8543c3483af95063f6efa04154bba758` |

两批来源摘要分别为 `099c4c313a68958c547dfb298aa90bbc8376bbba449cdc9844a617a57b28f5a3`、`1e77d74c3e89dcfc50e1277ef7dceb7eaab559aef3c264c0ecf0418c2d2f2913`。实际生产规则、日期和假设原文经 Node 独立重算摘要，传给当前构建的 Server `planNavSnapshotInputsV3` 与规则校验器，预热/执行/尾部计划一致；同一真实日期改为严格模式被拒绝。

命令：`rtk proxy node /private/tmp/e01-nav-calendar-server-probe.mjs`。该临时探针调用生产函数与当前 Server 构建；长期复验入口为仓库生产函数及定向测试。不代表完整 Snapshot、业务 Run、公开 API 或目标部署验收。

## 本地检查与失败修复

- 新增日期测试 28 项通过，含三个集合、非交易日估值、缺日、显式决策、模式、预热/尾部不足、规则范围、来源/规则原文篡改、重复/未来净值、未来可见/生产、未核验日历制品及不可变证据。首次有一项测试的受控日历仍足够，修正夹具使 T+2 确实缺披露尾部后通过；未放宽生产门禁。
- DSA 相关 11 文件回归 207 项通过，4 条警告，2.32 秒。四份变更 Python 文件完整 flake8 与编译通过。
- Server NAV 四文件首次共 73 项通过；随后加强研究引用守卫并增加版本伪装拒绝测试，最终输入计划文件 21 项通过，其余三个未改动文件既有 53 项结果继续有效。
- Server typecheck、build、限定 ESLint、Prettier、主仓 import boundaries 均通过。真实探针首次因临时脚本未加入 DSA 导入路径而失败，修正探针路径后来源与接缝通过；该失败发生在读取上游前，未重复已失败的来源请求。
- 文件尺寸检查退出 0，报告 10 个未提供基线的既有大文件警告，不能据此声明它们的 ratchet 已实际核验。本叶两个主仓生产文件分别为 172/108 行，未触及这些既有超限文件；两仓空白检查通过。
- 本轮没有变更依赖、数据库、镜像或常驻容器代码，没有创建 Run、修改 Policy 或签发准入。

主要验证命令：

```sh
rtk proxy .venv/bin/python -B -m pytest tests/test_thesis_ledger_nav_calendar.py tests/test_thesis_ledger_nav_rules.py tests/test_eastmoney_fund_nav.py tests/test_eastmoney_nav_evidence.py tests/test_thesis_ledger_nav_dates.py tests/test_thesis_ledger_current_data_route.py tests/test_thesis_ledger_provider_runtime.py tests/test_thesis_ledger_contract.py tests/test_thesis_ledger_data_v3_target_pins.py tests/test_efinance_realtime_quote.py tests/test_thesis_ledger_consumer_boundary.py -p no:cacheprovider -q --tb=short --disable-warnings
rtk proxy pnpm --filter @thesis-ledger/server exec vitest run test/backtest/backtest-nav-input-plan.test.ts test/backtest/backtest-nav-visibility.test.ts test/backtest/backtest-nav-domain-input.test.ts test/backtest/backtest-nav-snapshot-store.test.ts
rtk proxy pnpm --filter @thesis-ledger/server typecheck
rtk proxy pnpm --filter @thesis-ledger/server build
rtk proxy node scripts/check-boundaries.mjs
```

最终源码摘要：来源证据模块 `b94e08f8779b24dfdd49a690b857044b980266f584cc4e2791abc17b768ceb15`，研究日期模块 `617e750aec5c70bdfa503ce2f88b60646fd38cb725b4711b0856590a75fae4e1`，日历制品读取模块 `c5ff40ad37b81f7a4d71bf5fbd3838bdb6c13ac9ce73372b121a71d89fcb8a2c`。

## 后续消费义务

N2.3.2.3 接通精确路由/API 时，必须核验标的身份、模式、准入与来源修订，并返回日期、假设和用户决策原文；N2.4/5 冻结时须重建日期关联，不能只信任 `coverage.complete` 或摘要字符串。N3/4 继续验证 Runner 与目标结果中上述研究假设和限制的披露。严格 PIT、真实基金暂停/限购与独立完整日历不因本叶完成取得资格。
