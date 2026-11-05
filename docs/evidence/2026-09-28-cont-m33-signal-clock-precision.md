# M33：V3 事件策略信号的精确决策时钟

## 修复范围

此前 V3 的事件依赖计划和原始记账已按完整小数秒比较，但 Domain `corporateActionEvent` 在运行时仍用 `Date.parse` 判断事实 `availableAt` 和公告 `announcedAt` 是否早于策略 tick。同一毫秒内晚一微秒的事件会被误判为已可见。Domain 引擎为 V2/V3 共用，直接改动其排序和判断会触及 V2 冻结语义。

本叶在 Server V3 进入共用引擎前，对策略实际引用的事件类型、证券、`effectiveDate` 和决策 tick 逐项检查。使用 Schemas 的完整小数秒瞬时比较，多个同日 tick 取最早决策时刻；事实或公告晚到、非法瞬时、缺生效日或缺策略可见性均以 `DATA_UNAVAILABLE` 失败关闭。无事件表达式不增加事件取数要求，V2 不执行此守卫。服务端异常表示本次 V3 运行不可用，不会将晚到事件变为 false 信号继续成交。

## 验证

| 检查 | 结果 |
| --- | --- |
| 新增守卫定向测试、V2/V3 执行回归 | 3 文件、14 项通过；覆盖同毫秒晚一微秒、时区等价、同日多 tick、无事件表达式 |
| Server 事件依赖、记账和转换回归；Domain 事件信号回归 | Server 3 文件、20 项与 Domain 1 文件、7 项通过 |
| Server typecheck/build、限定 ESLint、新文件 Prettier、import boundaries、`git diff --check` | 通过；两份既有修改文件仍有先前的 Prettier 差异，本叶未对它们做宽格式化 |
| infra `./scripts/sync-code.sh thesis-ledger` | 兼容性预检及构建通过；Server/Worker 均 healthy；宿主与两容器的新增编译模块 SHA-256 同为 `2c16f30655e8a04eae3e625309867f9736781c40127f24a283d74da5ea0da22a` |
| 两容器编译模块受控执行 | Server、Worker 各一次：晚一微秒被 `DATA_UNAVAILABLE` 拒绝，恰好相等接受；使用合成事件，不代表真实来源 |

## 剩余边界

本次官方快更只更新目标容器可写层，Server/Worker 镜像仍为 `sha256:82037ac5d35693827d679fc9d8b9341fc52cf13116f28a7095a38660b9a31f9b`。尚未完成真实 HiThink 事件来源、159516 目标准入或普通回测。若未来 V3 支持比当前日线更细的决策频率，需要重新审视引擎其余 `Date.parse` 排序路径；本守卫保证进入当前日线事件策略的事实不会晚于最早决策 tick。
