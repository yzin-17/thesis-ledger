# Mobile 原生联网、只读边界与配色验收

> 2026-10-15 当前责任：本页拥有原生联网、实际/模拟隔离、只读边界、原生视觉与配色的未通过验收。父任务和最终汇总退出当前目录；它们没有被记为完成。涨跌配色的 Desktop 正向证据复用，Mobile 产品运行态仍须独立验证。

> 状态对账（2026-10-03）：已实现待验收：两项未勾选的原生联网与状态视觉仍有效。旧“无 Android/CoreSimulator 拒绝”是当时环境事实，本轮未检查设备，不能认定为今天仍存在的阻塞；下一次先核实设备，再验证当前合同。多源任务对 Electron 的跳过不豁免 Mobile。 本段为当前对账结论；下文历史时点的环境与协议描述仅在其原范围有效。对账依据见[本轮 Review](../archive/reviews/2026-10-03-task-state-reconciliation.md)。

**要构建的能力：** Mobile 在实际原生运行环境中能够读取 ThesisLedger API 的投资组合和风险信息，同时保持纯只读客户端，不暴露市场数据控制面写操作或 Control Token。

**启动条件：** 先核实当前 Android/iOS 原生目标和实际网络配置；旧设备缺失只作历史记录。未获取真实原生证据前，联网、视觉及配色门禁继续开放。

**状态：** 已实现待验收；旧父任务、汇总和配色记录的剩余条件由本页统一维护。

- [ ] 原生 Mobile 能在实际网络配置下读取 actual 与 shadow 数据及错误状态。
- [x] 应用源码、运行配置和网络请求中均未发现 DSA Control Token。
- [x] Mobile 不提供 Provider 配置、Policy Apply、目录同步或凭证写入入口。
- [ ] 浅色、深色、空数据、stale 和错误状态完成原生人工视觉验收并保留外部证据。

## 已执行验证

- `pnpm --filter @thesis-ledger/mobile typecheck`：通过。
- `pnpm --filter @thesis-ledger/mobile test`：6 passed；覆盖 actual/shadow、空数据、stale、error、刷新竞态和 API base URL。
- `rg` 扫描 `apps/mobile` 源码及运行配置：未发现 `THESIS_LEDGER_CONTROL_TOKEN`、`Control Token`、Provider 配置、Policy Apply、目录同步或凭证写入入口；Mobile 只请求 ThesisLedger portfolio/risk API。
- 当前 Android SDK 内 `adb devices -l` 返回空设备列表；`xcrun simctl list devices available` 因 `CoreSimulatorService connection refused` 失败。无法执行原生联网与原生视觉验收。既有 Mobile Web 证据不替代本票的原生证据，故保留未完成状态。

<a id="native-parent-review"></a>
## 旧父任务与最终汇总承接

原 [v1.2 父任务](../archive/tasks/2026-08-18-market-data-provider-v1-2.md) T11 和 [closure-11 汇总](../archive/tasks/2026-08-18-market-data-provider-v1-2-closure-11-final-review.md)没有另一组独立原生验收；本页两项未勾选原生叶仍持有其实际网络、actual/shadow 隔离和浅色/深色、空数据、stale、错误态条件。取得原生证据后，更新原 AC-09、AC-10、AC-11 的最终映射，才能关闭这一承接范围。

原实现、来源 smoke、发布和回滚记录仅在原版本与范围有效。旧 Data/Control Contract、Effective Policy 和旧接口已由 [Canonical](../architecture/canonical-runtime.md)承接；2026-10-03 对账已明确不重复已完成发布/回滚。本节不恢复退役 V1 接口或新增第二次设备验收。原 T11 原文及全部 AC 矩阵仍留在归档正文，其他当前合同与各 Task 的独立门禁不受此承接影响。


<a id="mobile-color-acceptance"></a>
## 涨跌配色的原生剩余验收

对应 [配色 Spec](../specs/2026-09-15-market-color-scheme.md)；原 [实施与证据](../archive/tasks/2026-09-15-market-color-scheme.md)保留完整 T1–T4、AC1–AC6 和命令。本节 I1 属于原配色 Task，不是新的实现步骤。Desktop 两种配色、刷新恢复及图表视窗/十字光标已有证据；仅在其输入变化时复验。Mobile 配色、冷启动持久化恢复与固定状态色边界尚未取得产品证据，原生 compile 或 Web 不能替代。

- [ ] I1：跨端产品验收与证据汇总。
  - 覆盖验收标准：AC1–AC6 的组合行为
  - 依赖：T1–T4 完成；Desktop 运行态与 Mobile Native 环境可用
  - 涉及范围：Desktop 浏览器两种配色、刷新恢复、已打开图表保留视窗/十字光标；Mobile 运行态恢复。不可用环境不得用单元测试替代。
  - 完成条件：可执行的运行态证据记录，未执行门禁明确标为未验收。
  - 验证方式：browser skill 最小真实验收；真实模拟器/设备或精确阻塞记录。
  - 验证证据：Desktop 浏览器已完成两种配色、刷新恢复及已打开图表的视窗/锁定十字光标保持验收；收起侧栏的入口存在性已确认，精确几何测量因 Browser 自动审查超时未取得。Mobile 真实模拟器/设备的启动恢复仍未验收；Native compile 结果见 T4。

- [ ] 必要集成、真实运行态与条件性门禁均已通过或有合法不适用依据（Mobile 产品运行态仍待验收）
