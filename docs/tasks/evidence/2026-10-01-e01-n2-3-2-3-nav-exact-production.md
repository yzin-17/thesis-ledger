# E01-N2.3.2.3 精确净值生产与统一验收

## 范围与结论

2026-10-01，按用户“2.3 整体完成后再测试”的要求，先完成剩余接口、合同、证据投影、用例和文档，再统一执行验证。N2.3.2.3、N2.3.2 与 N2.3 已达到生产者验收条件。

新增鉴权 `POST /api/v3/thesis-ledger/backtest/nav-inputs`，精确绑定 `CN / MUTUAL_FUND / FUND_NAV_HISTORY / efinance / eastmoney`、策略/目录版本、基金类型、范围与日期预算。对应适配器和来源修订为 `efinance-fund-nav-raw-v1`、`eastmoney-fund-nav-raw-v1`；旧准入不能授权新接口。严格模式返回 `publication_unavailable`。

Schemas 提供请求、响应与共享日期合同；路由准入属于稳定领域合同，事件与 NAV 分别消费并收窄能力。DSA 单独建立请求校验、准入守卫、基金身份 Reader、生产编排和证据投影，避免扩大现有 ProviderRuntime。Server 只改共享日期合同引用。

## 证据绑定

- 基金身份通过东方财富基金列表的代码与明确类型核验；不按名称推测 QDII。身份原文保留，未知/重复/不符类型拒绝。
- 原文 Reader 保留所有净值页及逐条原生记录；十进制字符串保持原样。规范记录使用明确投影修订和原生摘要构造稳定 ID。
- 响应冻结信封包含基金身份原文、完整净值页、投影记录、规则原文、规则文件字节、日期原文、假设及用户决策；所有相关摘要重新核验。
- 研究事实的 `publicationEvidence.evidenceRef` 指向规则原文；来源页身份保存在规范记录的页索引与原生证据信封中。
- 读取前后复核 Effective Policy、Catalog 和精确 Admission；后置范围包含实际预热与尾部，安全条件也重新校验。
- 研究日期版本及引用绑定假设摘要；缺日不交易，预热、处理尾部、披露尾部或可见性不足拒绝。

## 本地统一验证

| 层次 | 命令及输入 | 结果 |
| --- | --- | --- |
| DSA 新增定向 | `.venv/bin/python -B -m pytest tests/test_eastmoney_fund_identity.py tests/test_thesis_ledger_nav_production.py -q -p no:cacheprovider` | 35 项通过 |
| DSA 相关回归 | 上述两文件及 `test_eastmoney_fund_nav`、`test_eastmoney_nav_evidence`、`test_thesis_ledger_nav_rules`、`test_thesis_ledger_nav_calendar`、`test_thesis_ledger_nav_dates`、`test_thesis_ledger_current_data_route`、`test_thesis_ledger_provider_runtime`、`test_thesis_ledger_market_v3_admission_runtime`、`test_thesis_ledger_events_v3` | 11 文件 220 项通过，4 条既有测试/依赖警告 |
| Schemas 全包 | `pnpm --filter @thesis-ledger/schemas test` | 首轮 576 项通过；最后增加引用错配负例后，NAV 来源合同 12 项通过 |
| Server NAV 定向 | `pnpm --filter @thesis-ledger/server exec vitest run test/backtest/backtest-nav-input-plan.test.ts test/backtest/backtest-nav-visibility.test.ts test/backtest/backtest-nav-domain-input.test.ts test/backtest/backtest-nav-snapshot-store.test.ts --maxWorkers=2` | 最终 74 项通过 |
| Server 全包 | `pnpm --filter @thesis-ledger/server exec vitest run --maxWorkers=2 --reporter=dot` | 231 文件、1800 项通过；25 文件、83 项按既有条件跳过 |
| 类型与构建 | Schemas build；Server typecheck/build | 通过；Schemas 最终准入校验拆分后再次 build 通过 |
| Python | 新增/修改独立模块完整 flake8，变更入口和模块 compileall，缓存写到临时目录；仓库 `flake8 . --count --select=E9,F63,F7,F82 --statistics` | 通过，仓库关键错误 0 |
| 主仓门禁 | `node scripts/check-boundaries.mjs`；修改文件 ESLint、Prettier；新增 Schema 复杂度上限 20、函数尺寸上限 220 | 通过 |

最后修正研究引用后，DSA 受影响五文件 135 项、Schemas 来源及事件两文件 40 项再次通过；后补来源引用负例也通过。Server 全包输入不受 DSA 引用值调整影响，最终 NAV 定向及真实冻结另行复验。

错误配对覆盖：缺失/非法请求、未知基金类型、身份不符、严格发布时间缺失、旧修订准入、过期/未来/撤销准入、范围缺失、读取中策略/来源/启用变化、预热与尾部不在准入范围、来源篡改、未来采集、日期预算不足、鉴权和读取后安全条件变化。

尝试全仓普通样式 flake8 时发现既有大量样式问题；该命令并非项目 CI 门禁，不将其记作通过，也未广泛格式化其他文件。变更模块完整样式检查和仓库现行关键错误门禁分别通过。

## 真实来源、鉴权 HTTP 与冻结

使用隔离 SQLite 建立仅用于本次验收的精确研究准入与策略，经实际 FastAPI 路由及 token 校验，读取真实东方财富身份/净值、官方 QDII PDF 和已核验 XSHG 制品。HTTP 是本地 TestClient 传输，未部署目标容器。进入当前 Schema 后，将响应转换为现行冻结输入，执行真实 Parquet 写入、离线 replay 及完整上下文一致性校验。

运行区间为 2026-09-08 至 09-15，预热 4 条、处理尾部 4 个日期；研究日历覆盖 09-02 至 09-21。每只基金冻结 10 条预热/执行事实，完整来源页包含日期构造所需尾部。

探针的 `dataAsOf` 为请求发起时刻加 3 分钟，给真实采集留下明确预算；所有实际配置、采集和生产时刻均须早于该截止时点，未将历史净值日期改写为来源发布时间。

| 标的 | 来源类型 | 净值总量 / 页数 | 研究延迟 | 最终生产 UTC 时刻 |
| --- | --- | --- | --- | --- |
| 161725.OF | 指数型-股票 | 2764 / 3 | T+1 | 2026-09-30T17:30:22.135795+00:00 |
| 110011.OF | QDII-混合偏股 | 4410 / 5 | T+1 | 2026-09-30T17:30:36.379394+00:00 |
| 118001.OF | QDII-普通股票 | 3900 / 4 | T+2 | 2026-09-30T17:30:49.822629+00:00 |

三只基金预热均为 `09-02、09-03、09-04、09-07`；尾部处理日期均为 `09-16、09-17、09-18、09-21`。无 token 返回 401，严格模式返回 422/`publication_unavailable`；研究响应全部通过 Schema、原文及规则文件摘要、Server 计划、真实 Parquet 冻结与离线读回，严格消费同一研究日期被拒绝。

最终来源整批摘要：

- 161725：`73ea7de7585648761967086c046fe6a42abf6d8d6895beaed49df0a9aac674d8`
- 110011：`099c4c313a68958c547dfb298aa90bbc8376bbba449cdc9844a617a57b28f5a3`
- 118001：`1e77d74c3e89dcfc50e1277ef7dceb7eaab559aef3c264c0ecf0418c2d2f2913`

最终响应摘要：

- 161725：`dc3670bf51ddd3dc94287ab8bbca3594b8817ca1771885642be9f42cda1e3c45`
- 110011：`f55968ef19fbeff562795a424db3683a1d266574bd90cc077354e30c1c7a2e79`
- 118001：`0a97826734b6b6b0a72dd6076f5f221bad5a5dd51070d865ce9e18529584901f`

110011、118001 官方 PDF 摘要分别为 `bc6940d7f3209ff05571e20727200d69ca78ffce593d6a6921fb0ec521c4f1c4`、`2c0ac2a0eb177f9966a7dd254e2bdf29c269654baf9c489928898068594d068b`，与审查登记一致。

探针为 `/private/tmp/e01-nav-production-live-probe.py` 和 `/private/tmp/e01-nav-production-freeze-probe.mjs`，最终运行 `node /private/tmp/e01-nav-production-freeze-probe.mjs` 成功。原文捕获保存于临时 JSON，冻结目录验收后清理；敏感身份和目标配置未写入证据。

## 故障与修复记录

首次探针用含 `.OF` 的标的构造 runId，被现行路径保护拒绝；只修改临时探针的 runId。随后真实冻结发现生产者将研究证据引用填成来源页，和现行 Server 的规则引用合同不符，冻结正确拒绝。修正 DSA 投影、Schema 绑定及负例后，先重用已采集原文复验，再以最终生产代码重新直连来源，三只全部通过；未放宽 Server 冻结门禁。

新增响应 Schema 的首轮复杂度检查发现校验函数超过上限；按准入绑定职责提取纯校验函数，复验通过，未提高阈值。

## 后续边界

此次不修改目标 Policy/Admission、不部署、不创建业务 Run、不改数据库/Worker。研究默认不模拟真实暂停、限购、投资者和渠道差异；当前基金类型来源也不证明历史类型转换完整性。

下一叶为 N2.4：建立 Server 精确 Reader 与准备，重新核对请求身份、当前准入和原文/规则/假设/日期关联，并绑定完整 N1 输入计划。N2.5/6 与 N3/N4 分别继续状态机、数据库、执行分支和目标验收；此次通过不能代表这些阶段完成。
