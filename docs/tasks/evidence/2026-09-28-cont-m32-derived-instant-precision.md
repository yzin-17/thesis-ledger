# M32 派生序列微秒时钟修复

## 范围与问题

`freezeDerivedRawWindowV3` 和 `deriveMarketSeriesV3` 原先用 `Date.parse` 的毫秒精度比较 `dataAsOf`，把晚一微秒的来源或因子观测当作同一时刻；生成的 Bar 及价格基准 `observedAt` 也被格式化成毫秒。该行为与 Spec §8.2 的真实观测截点及最晚可用时刻不符。只修改 Server Market 的派生输入、冻结读取和对应局部测试；未触真实来源、账号或数据库。

## 修复与兼容

新 `raw-times-factor-over-fixed-anchor-binary64-v2` 使用已有精确证据瞬时比较器核对 Bar 时间、因子时间、raw 来源观测、Bar/因子/锚点可用时刻与截点，保留最晚原始瞬时字符串，不截断小数秒。非法时刻失败关闭。冻结写入使用 `v2`，完整输入指纹因算法修订变化；旧 `v1` 快照由原毫秒计算路径重放，旧指纹和结果不被新规则静默改写。价格基准的 `observedAt` 从派生 Bar 取精确最大值。来源准入及撤销仍由未来 Reader 核验。

## 验证

- 新反例修前 3 处失败：raw 来源观测晚一微秒未拒绝，Bar/因子/锚点晚一微秒未拒绝，派生 Bar 微秒时刻被截断。修后另增加 Bar 与因子时间相差一微秒拒绝、raw 观测和价格基准微秒保留、旧 `v1` 快照重放验证。
- 定向派生核心、冻结、raw 接缝、价格基准及仓储模拟 5 文件 **45 passed**；Server `typecheck`、`build` 与限定 ESLint 通过。Server 全包 **1791 passed、90 skipped**，其中隔离 PostgreSQL 派生仓储 3 项因缺专用连接而跳过；此前隔离 PostgreSQL 证据属于旧源码，未冒充本次通过。
- 本批 9 个文件限定 Prettier 与 ESLint、带 `GUARDRAIL_BASE_REF=HEAD` 的尺寸 ratchet、模块边界和 `git diff --check` 通过；尺寸检查保留 13 条未增长的存量警告。
- 官方 `./scripts/sync-code.sh thesis-ledger` 成功，Server 与独立 Worker 均为 running/healthy。两容器的 `market-derived-series-v3.js` 与新精确时钟 helper 摘要分别与宿主构建产物一致：`2d7be1229277c3a67614a42a788e8eedf1aac5724e9e8b99a456331901f981cd`、`ab8b447526c64e272f38a2a30e2723d13d74d0ef7bc11f743c59e17f10b0a002`。镜像仍为原 ID，快更位于容器可写层，重建后会消失；此同步不代表生产发布或真实派生运行通过。

完整准入、真实因子合同、目标运行和历史 PIT 资格保持开放。HiThink ETF 精确路由仍未签发准入，未发起新的 Provider 请求或普通回测。
