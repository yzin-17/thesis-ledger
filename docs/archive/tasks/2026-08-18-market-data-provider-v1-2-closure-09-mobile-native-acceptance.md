# Mobile 原生联网、只读边界与配色验收

> 完成归档（2026-10-16）：2026-10-15 已完成 Android 与 iOS 的原生联网、实际/模拟隔离、只读边界、视觉与配色验收。本页同时关闭旧父任务、最终汇总和配色任务承接的原生缺口；账户永久删除的独立 G4 仍由其现行 Task 维护。

> 旧“无 Android/CoreSimulator 拒绝”和[状态对账](../reviews/2026-10-03-task-state-reconciliation.md)保留追溯，已由本轮两端真实证据接续。模拟器通过不代表物理设备触控、Electron 或其他任务的独立验收通过。

**要构建的能力：** Mobile 在实际原生运行环境中能够读取 ThesisLedger API 的投资组合和风险信息，市场数据能力保持只读，不暴露市场数据控制面写操作或 Control Token。账户管理按[账户永久删除任务](2026-09-14-permanent-account-deletion.md)的独立合同验收。

**验收范围：** Android/iOS 原生模拟器及实际网络配置；原设备缺失只作历史记录。账户删除、真实 Provider 完整覆盖及其他任务的部署门禁独立维护。

**状态：** 已完成；旧父任务、汇总和配色记录的原生承接范围已通过。

- [x] 原生 Mobile 能在实际网络配置下读取 actual 与 shadow 数据及错误状态。
- [x] 应用源码、运行配置和网络请求中均未发现 DSA Control Token。
- [x] Mobile 不提供 Provider 配置、Policy Apply、目录同步或凭证写入入口。
- [x] 浅色、深色、空数据、stale 和错误状态完成原生人工视觉验收并保留外部证据。

## 已执行验证

2026-10-15 用户明确恢复 Android 与 iOS 两端模拟器验收，随后授权使用官方 ADB 操作本轮 Android 模拟器并截图。原生构建与安装、actual/shadow 联网、主题与状态视觉、配色冷启动恢复均已分别取得证据。定向测试为 3 个文件、23 项通过，Mobile 类型检查通过；两端运行态结论依据下表，不以测试或编译替代。

本轮 iOS 窄屏复现的标题竖排、金额断行已通过既有布局修复：标题与外观控件分行，金额区域按可用宽度换行。重新安装后，原生浅色与深色截图确认标题横排、金额两列完整显示；未改变数据请求或账户行为。

随后故障切换实测复现：模拟持仓已加载时切到实际模式，目标请求返回 503，原 store 仍保留模拟持仓，实际页签下错误展示该持仓。新增两个方向的回归先得到 2 failed / 21 passed；修复后 23 passed，另覆盖同模式失败保留及跨模式晚到响应。`MobileReadOnlyStore.setMode` 现立即清空上一模式的组合与风险数据；无有效结果的错误页保持未知。同模式刷新失败仍保留本模式上次成功数据。iOS 重新安装后的同场景 503 复验已确认不再显示模拟持仓。

| 原生范围 | 2026-10-15 证据 | 证据边界 |
| --- | --- | --- |
| iOS 编译与安装 | Xcode 26.6、iPhone 17 Pro / iOS 26.5，Release / `CODE_SIGNING_ALLOWED=NO` 原生构建与安装通过；最终默认 `127.0.0.1:3000/api/v1` 首页、空态与持久化复核通过 | 账户永久删除的独立剩余条件见 G4 |
| iOS 产品运行态 | actual 空组合、shadow 一条真实持仓；浅色/深色、两种配色、真实 stale、HTTP 503、跨模式失败隔离、冷启动恢复绿涨红跌通过；风险错误页显示暂时不可用 | 账户删除成功与完整交互矩阵不在本票 |
| Android 编译与安装 | JDK 17.0.20、Gradle 9.3.1、arm64 Release；API 35 AOSP ATD 专用模拟器安装与冷启动通过。恢复默认 API 后再构建、安装并实读 actual/shadow 成功 | 不代表物理设备、性能或镜像发布验收 |
| Android 产品运行态 | actual 空组合、shadow 一条真实持仓；浅色/深色、两种配色、真实 ready/stale、HTTP 503 同模式保留、跨模式清空、风险错误页与显式刷新恢复通过；配色冷启动及重新安装后保留 | 账户页包含停用账户、具名确认及取消通过；未执行永久删除 |

联网正向使用实际 Server API；负向使用仅绑定宿主机回环地址的只读转发器注入 503，不修改服务端数据、路由或 Provider，也不作为真实 Provider 失败证据。上述 stale 来自实际组合响应，未使用转发器的 stale 注入模式。配色切换前后业务请求计数同为 8；错误状态红色与陈旧状态黄色不随涨跌配色变化。

Android 对等检查中，配色切换前后转发器业务请求计数同为 34；503 下模拟持仓保留，切到实际模式后立即清除，错误页保持未知。最终直接使用默认 `10.0.2.2:3000/api/v1`，actual 空组合与 shadow 真实持仓分别通过，模拟持仓可显示真实 ready 状态。最终 APK SHA-256 为 `cd4b08713cd17748736fe3e7d9686a1ae6d50af71d60f9b949f426da7f2ad219`，JS bundle 为 `1e3d4cb0a66289eb37e8fcc96fdb6f2bbfbb824f8ba0b3dd37b9871889e03c8d`，已确认不含临时 `10.0.2.2:3377` 地址。

Android 环境修复记录：系统镜像首次重装空间不足，仓库正式空间维护后重装成功；依赖下载的 403 在官方 Central HTTPS 传输保留 Gradle 原请求头后消除，未改变依赖版本或关闭 TLS 校验。模拟器曾继承 Shell 的 `http_proxy`，导致宿主 API 请求失败；清除该测试进程的代理环境后重启，显式刷新与后续冷启动成功。ATD 默认 `debug.hwui.drawing_enabled=0` 导致首批截图全黑；仅在本轮测试设备开启绘制并重启应用后重新取得有效截图，参见[Android 官方 ATD 说明](https://developer.android.com/studio/test/managed-devices#use-atd)及[绘制开关源码](https://android.googlesource.com/platform/frameworks/base/+/2d4b18e60ade42c00d2ab7fe060a5393d8eb8304/libs/hwui/Properties.h)。

本机外部证据集中保存在忽略目录 `.recovery-artifacts/native-2026-10-15/`，包含原生截图、故障转发器及 `ios-mode-isolation-before.png` / `ios-mode-isolation-after.png`。最终默认配置的 JS bundle SHA-256 为 `f96a9ab7ab94f014ca16f02cdd99e9698ca9580a60cceca9bc5920131ccbfa14`，二进制为 `8a3ab4d4611a0937a9196b1b8f4497b21975dda2815e125bb935e5fa8c168400`。首次构建因 Pods 缓存的旧 Hermes 绝对路径失败；定向刷新同版本 `hermes-engine` 后通过，`Podfile.lock` 仅对应 podspec 校验值变化，无依赖版本升级。

2026-10-15 补充核对：[基线源码 CI](../../tasks/README.md#verified-source-baseline)的 Android debug 原生编译成功；本轮修改后的两端编译与运行态另外由上表证明，不能把基线 CI 当作未提交修改的 CI 结果。

- `pnpm --filter @thesis-ledger/mobile typecheck`：通过。
- `pnpm --filter @thesis-ledger/mobile test`：23 passed；覆盖 actual/shadow、空数据、stale、error、模式失败隔离、刷新竞态、账户行为和配色存储。
- 静态扫描 `apps/mobile` 源码及原生配置共 102 个文件，未发现 `THESIS_LEDGER_CONTROL_TOKEN` 或 `Control Token`；市场数据只读消费不新增 Provider 配置、Policy Apply、目录同步或凭证写入入口。实际网络验收使用 ThesisLedger portfolio/risk API；账户页另按账户管理合同维护。
- 原执行时点的环境观察：当时 Android SDK 内 `adb devices -l` 返回空设备列表；`xcrun simctl list devices available` 因 `CoreSimulatorService connection refused` 失败，未执行原生联网与视觉验收。这不证明今天仍缺设备；接续时先核对当前目标。既有 Mobile Web 证据不替代本票的原生证据，故保留未完成状态。

<a id="native-parent-review"></a>
## 旧父任务与最终汇总承接

原 [v1.2 父任务](2026-08-18-market-data-provider-v1-2.md) T11 和 [closure-11 汇总](2026-08-18-market-data-provider-v1-2-closure-11-final-review.md)没有另一组独立原生验收。本轮已补齐实际网络、actual/shadow 隔离和浅色/深色、空数据、stale、错误态条件；AC-09 的原生客户端体验、AC-10 与 AC-11 原先仅因原生缺口开放的承接范围均已通过。历史持久化、发布和回滚证据仍只对原版本与范围有效，不据此宣称当前镜像或其他 Task 的部署验收通过。

原实现、来源 smoke、发布和回滚记录仅在原版本与范围有效。旧 Data/Control Contract、Effective Policy 和旧接口已由 [Canonical](../../architecture/canonical-runtime.md)承接；2026-10-03 对账已明确不重复已完成发布/回滚。本节不恢复退役 V1 接口或新增第二次设备验收。原 T11 原文及全部 AC 矩阵仍留在归档正文，其他当前合同与各 Task 的独立门禁不受此承接影响。


<a id="mobile-color-acceptance"></a>
## 涨跌配色的原生剩余验收

对应 [配色 Spec](../../specs/2026-09-15-market-color-scheme.md)；原 [实施与证据](2026-09-15-market-color-scheme.md)保留完整 T1–T4、AC1–AC6 和命令。本节 I1 属于原配色 Task，不是新的实现步骤。Desktop 两种配色、刷新恢复及图表视窗/十字光标已有证据；本轮补齐两端 Native 配色、冷启动持久化恢复与固定状态色边界，原生 compile 与产品运行态分别通过。

- [x] I1：跨端产品验收与证据汇总。
  - 覆盖验收标准：AC1–AC6 的组合行为
  - 依赖：T1–T4 完成；Desktop 运行态与 Mobile Native 环境可用
  - 涉及范围：Desktop 浏览器两种配色、刷新恢复、已打开图表保留视窗/十字光标；Mobile 运行态恢复。不可用环境不得用单元测试替代。
  - 完成条件：可执行的运行态证据记录，未执行门禁明确标为未验收。
  - 验证方式：browser skill 最小真实验收；真实模拟器/设备或精确阻塞记录。
  - 验证证据：Desktop 浏览器已有两种配色、刷新恢复及已打开图表的视窗/锁定十字光标保持证据；iOS 与 Android 本轮均完成两种配色、浅色/深色、固定状态色、冷启动恢复和不新增业务请求检查。截图见本机忽略目录中的 `ios-*`、`android-shadow-*`、`android-error-*`、`android-cold-start-green.png` 和 `android-default-api-shadow.png`。

- [x] 本票及原生承接范围的必要集成、真实运行态与条件性门禁均已通过；账户永久删除、物理设备和其他 Task 的独立条件不由此关闭。
