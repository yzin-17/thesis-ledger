# 策略风险自动监控验收证据

对应 [Spec](../../specs/2026-11-13-strategy-risk-automatic-monitoring.md) 和 [任务](../tasks/2026-11-13-strategy-risk-automatic-monitoring.md)。

## 实现与数据边界

策略应用通过现有自动消费器的分布式锁调度，即使没有新的报价观察记录，也按应用的 60 秒 Redis 检查窗口执行。Risk 的应用执行器复用策略上下文、持久化事件状态机与通知策略；普通规则仍走原有观察流，策略不会重复进入模拟扫描。

Market 的后台日线读取按精确窗口保留 600 秒成功/失败缓存和请求窗口，复用现有行情 Reader 及来源控制。应用内需要持有周期的规则共用开仓至今的窗口和实际上下文。后台没有有效持仓时不读取行情；没有 Asset 记录时优先确认持仓缺失，不推测市场或新建资产。

后台缓存读取前校验本地已应用的来源设置，缓存按设置修订隔离；控制关闭或修订变动使旧缓存失效，原请求窗口继续保留。取数完成前再次核对修订，拒绝设置变化期间的结果。

服务端返回带规则版本、原因码和检查时间的逐条诊断；当前停用、旧版本及失效对象的诊断不进入响应。Desktop/Mobile 直接展示标的名称、代码、规则和中文原因，未按中文文本推断状态。

## 定向与包级验证

- Domain 策略监控 5 项测试通过；Domain、Schemas、API Client 构建通过。
- Server 风险目录：18 个文件通过，132 项测试通过；3 个依赖独立环境的文件及 17 项测试未在该命令中执行。
- 上下文、来源窗口、策略预览、账户准入和基金净值相关定向用例通过，覆盖无持仓不请求行情、缺开仓时间与成本止损相互独立、无效成本、日历未知、来源未选和分钟周期限制。
- 后台窗口读取 4 项测试通过，包括跨实例缓存、失败后限频恢复、并发读取等待及控制关闭/修订不绕过请求窗口。
- Server、Desktop 构建及 Mobile TypeScript 检查通过；未修改原生配置或依赖。
- 修改的生产文件定向 ESLint 通过。边界检查通过，文件尺寸门禁无警告。
- 全仓复杂度检查发现 `apps/server/test/market/arena-history-source.test.ts:34` 的 `_input` 未使用错误，并有存量警告及 React Native 源码解析提示。本次未修改该文件，未将全仓检查记为通过。

## 隔离运行态

从主仓执行 `node scripts/test-risk-monitoring-runtime.mjs`，使用仓库维护的临时 PostgreSQL/Redis 入口，严格核对专用数据库、owner 和 Redis 哨兵。52 个 migration 完整执行，结构 head 为 `20261112030000_arena_replay_timeline`；未修改结构输入。

最后一次运行 10 项测试全部通过，隔离容器已清理，没有操作开发服务或 volumes。策略新增场景实际验证：

- 没有报价观察记录时，已启用策略应用仍生成实际风险事件。
- 缺少开仓时间仅阻止最大持有周期，成本止损仍可触发。
- 连续评价复用一个持久化事件，没有生成模拟事件。
- 通知排队首次失败后复用原事件重试，成功后不再重复排队。
- 同窗口的行情读取只执行一次。

首次隔离运行的既有报价获取用例未注入现行日历 Reader，因而没有生成预期事件；该受控用例现显式使用测试日历，保持生产日历门禁，复验通过。

## 浏览器

`PLAYWRIGHT_MODULE=/tmp/thesis-risk-notification-qa/node_modules/playwright node scripts/local-runtime/browser/risk/strategy-risk-monitoring.regression.mjs` 通过。

Desktop 实际 RiskCenter 和 Mobile 实际监控组件分别在 1440、1024、768、390 宽度验证，共 40 个组合：缺持仓、日历/日线来源缺失、缺成本/持有周期、等待首次检查、数据恢复正常。全部无横向溢出、脚本错误、意外请求或写请求。

截图保存在 `/tmp/strategy-risk-monitoring-qa/`。所有响应均为受控样本，未以浏览器修改真实规则、持仓或通知。

## 目标运行态

当前目标规则为腾讯控股 `00700.HK` 的成本止损与最大持有周期。只读查询确认目标实际账户没有该标的持仓，且尚无对应 Asset 记录；目标规则在当前事件响应中无新增事件。

从 `thesis-ledger-infra` 执行 `./scripts/sync-code.sh thesis-ledger`，最后一次退出 0，完整日志为 `/tmp/strategy-auto-sync-final.log`。兼容性预检通过，Server/Worker 均健康；没有执行数据库结构或外部卷变更。两者镜像 ID 保持 `sha256:6c08cbe3666e399ef084d29b951e7f46fbe00b7fd85b4544b2f6aefcf628d885`，本轮为容器可写层快更，不是镜像重建或生产发布。

同步后只读调用 `/api/v1/risk/monitoring` 返回 200：`eligibleRules=2`、`unsupportedRules=0`、`processorAvailable=true`、`error=null`。两条规则最近检查时间为 `2026-11-12T17:28:19.804Z`，均返回 `position_missing` 和“缺少实际持仓数量”；标的名称为腾讯控股。目标规则在事件响应中仍为零条，未以缺数据生成风险事件。

独立读取 Worker 运行文件，确认新监控执行器、诊断 Schema 和后台来源策略校验均已包含。没有为了验收修改真实持仓、规则开关或通知提供方。

首轮正式入口 `../thesis-ledger-infra/scripts/sync-code.sh thesis-ledger` 在取得更新锁前退出 1，未修改容器。锁由仍存活的 `arena-research-recovery.mjs` 维护任务持有，具有既定观察窗口；未删除锁或中断该任务。

本次文件的差异空白检查通过；共享工作区整体仍有其他任务文件的行尾空白差异，未清理或覆盖其修改。未提交或推送代码。
