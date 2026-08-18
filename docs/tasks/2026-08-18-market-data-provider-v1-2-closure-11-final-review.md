# 11 — 执行发布、回滚和最终追踪 Review

**要构建的能力：** market-data/provider v1.2 具备可发布、可回滚、可审计的最终闭环；每项验收标准都能追溯到实现、确定性测试、运行时证据或明确接受的外部风险。

**阻塞于：** closure-09 的原生设备/视觉环境。

**状态：** partial-native-runtime-blocked

- [x] 三仓版本组合、发布顺序、持久卷和配置注入已完成发布前核对；Compose render、当前镜像构建和四服务健康检查通过，未删除任何数据卷。
- [x] DSA 与 ThesisLedger 重启后保留完整 Policy 的 Effective projection；本轮 rollback smoke 后当前为 revision 11，fixture mode 保持关闭。
- [x] 已完成非破坏回滚演练：revision 3→4 回滚到历史 revision 1 后，Quote/Bars/Fund NAV/Fund NAV history/Indicator 均 HTTP 200；随后 4→5 恢复包含 CHIP_SUMMARY 的策略，5→6 做首次 efinance 专属 smoke，6→7 恢复完整策略，7→8→9 和 9→10→11 再次验证 patch 后的 efinance-only smoke 与完整策略恢复。历史 `[11, 10, 9, 8, 7, 6, 5, 4, 3, 1]` 保留，PostgreSQL、Redis、DSA SQLite 卷均未删除。
- [x] 已建立下方 AC 到实现、测试、运行时证据和遗留风险的最终追踪矩阵。
- [x] Spec、任务状态、架构说明、Contract、Changelog 和 closure 文档已按当前实现同步；原生设备、efinance 上游和回滚缺口均有明确结论与后续动作。

## 最终 Review 结论

- closure-04 至 closure-08：确定性实现与定向回归已完成；包括 Data Gateway 黑盒边界、跨连接 revision 原子性、Catalog lease、异步 worker 以及 Provider 子进程超时隔离。
- closure-09：保持 `partial-native-runtime-blocked`。Mobile typecheck、6 项测试、只读边界和 Control Token 扫描通过，但当前没有 Android `adb` 设备或 iOS Simulator，无法完成原生联网与人工视觉证据。
- closure-10：已完成。fixture 已关闭；开启 `ENABLE_EASTMONEY_PATCH=true` 后，efinance 专属 Quote、Daily Bar、Fund NAV、Fund NAV history 均成功，实际 `provider=efinance` 且 `fallbackUsed=false`；本轮不需要 API key 或登录 Cookie。
- Standards/Spec 双轴 Review 的确定性问题已处理：新增公共控制/运行时符号补齐 docstring，revision 跳号与 latest-valid 语义统一，并补充 Secret Key 轮换与 fixture 默认关闭的回归/配置证据。未发现新的契约、安全或正确性阻断；可选的内部重构建议不影响当前验收，不扩大本轮范围。

## AC 追踪矩阵

| 验收标准 | 主要实现/任务 | 证据 | 结论 |
| --- | --- | --- | --- |
| AC-01 独立策略模型 | Control Contract、Desired/Effective Policy、closure-02/05 | DSA/Server 定向测试，revision 11 API 应用 | 通过 |
| AC-02 Contract 分离 | Data Contract V1、Control Token、closure-01/04 | Contract black-box、consumer boundary、跨仓 Server 测试 | 通过 |
| AC-03 版本与原子性 | `thesis_ledger_control.py`、`market-control.service.ts`、closure-05 | 并发/跨连接测试；revision 1→3 单调跳号测试 | 通过 |
| AC-04 Provider fallback | Provider runtime、Data Gateway、closure-04/08 | 65 项定向回归 + 当前真实 API；CHIP 失败保持 503；efinance-only 四项 smoke 通过 | 通过 |
| AC-05 目录同步 | Catalog snapshot/delta、lease/worker、closure-06/07/08 | Catalog job、timeout isolation 回归 | 通过（未做完整回滚） |
| AC-06 标的身份 | Instrument/Asset association、closure-02 | Server 目录/别名/确认测试 | 通过 |
| AC-07 缓存与 freshness | Server cache、Fund NAV history、freshness gate | Server 89 项测试、facade Contract smoke | 通过 |
| AC-08 凭证与测试 | write-only credential、Secret Key rotation | Secret rotation 2 项测试；控制测试 11 项 | 通过（真实轮换演练未做） |
| AC-09 客户端体验 | Desktop/Mobile、closure-09 | Desktop 15 项测试/typecheck；Mobile 6 项测试/typecheck；原生设备缺口 | 部分通过 |
| AC-10 持久化与发布 | Compose、独立 SQLite 卷、migration、closure-11 | Compose config/build、四服务 healthy、重启后完整 Policy 保留、revision 3→4→5→6→7→8→9→10→11 回滚 smoke | 部分通过（原生门禁仍未闭环） |
| AC-11 验证证据 | 本 Spec、任务文档、closure-01..11 | 三仓 diff check、定向回归、Docker smoke、efinance-only 四项在线证据、原生缺口记录 | 部分通过（原生门禁未闭环） |

## 遗留项与关闭条件

- 原生 Mobile：获得 Android `adb` 或 iOS Simulator 后，执行 actual/shadow、空数据、stale、错误态及浅色/深色视觉验收，并保留外部证据。
- efinance：已通过 `ENABLE_EASTMONEY_PATCH=true` 完成四项专属在线 smoke；若后续 Eastmoney 再要求登录态，可使用 write-only `EFINANCE_EASTMONEY_COOKIE`，不应将 Cookie 写入仓库或日志。
- 回滚：在保留 PostgreSQL、Redis、DSA SQLite 卷的前提下，验证旧 Data Contract V1 与最后兼容 Effective Policy 可服务，再关闭 T11。
