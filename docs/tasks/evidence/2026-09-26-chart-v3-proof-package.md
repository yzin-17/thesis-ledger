# 图表 V3 可信证明供给实施记录

日期：2026-09-26。对应 U04-proof-package、U04-proof-consumer；整体任务继续 active。

## 实现

- 新增独立 `MarketChartProofRepository`，读取部署侧审核证明包，不复用行情覆盖仓库，不新增数据库结构或 HTTP 写接口。
- 配置必须同时提供绝对路径 `MARKET_CHART_COMPATIBILITY_FILE` 和小写 SHA-256 `MARKET_CHART_COMPATIBILITY_SHA256`；默认关闭。
- 每次最多读取 1 MiB，仅接受普通文件，包最多 100 条记录。逐字节摘要校验后解析严格契约；无效、过期、歧义或不匹配均返回无证明，不缓存上次成功结果。
- 精确匹配路由、标的、请求窗口、主备目标和 Desired/Effective/Catalog 修订。只提供等价证明，实际返回事实由既有选择器再次核对。
- MarketModule 注册 repository，图表 Reader 在主源失败后按需查询；备用返回后再次读取并核对同一份证明与观测，撤销或变化即拒绝结果。主源成功不触达证明文件。

## 部署输入格式

证明包为严格 JSON 对象，包含 `contractVersion: 3` 和 `entries` 数组；每条记录包含：

| 字段 | 内容 |
| --- | --- |
| `desiredRevision` | 精确 Desired 修订，正整数 |
| `effectivePolicyRevision` | 精确 Effective 修订，正整数 |
| `catalogRevision` | 精确 Catalog 修订，正整数 |
| `proof` | 既有 `marketRouteCompatibilityProofV3Schema` 接受的审核证明 |
| `observation` | 既有 `marketRouteCompatibilityObservationV3Schema` 接受的来源观测 |

运维先完成真实来源、算法、固定基准范围、量额及分红语义审核，再固定文件摘要并以只读方式提供给 Server。摘要只固定部署者选择的审核内容，不证明经济语义本身。测试目录中的 synthetic fixture 仅用于测试，不是可部署的真实准入证明。

删除文件可撤销后续和仍在等待返回的备用读取；替换文件必须同步更新部署配置中的摘要，否则供给关闭。证明窗口与实际请求必须完全一致，历史扩窗不会自动扩大证明范围。当前没有自动签发、客户端上传或价格转换执行器。

## 验证

- 图表定向：6 文件、50 项通过，覆盖配置成对校验、摘要固定、精确修订/目标/窗口匹配、过期、重复匹配、删除撤销、文件变化、超限及调用期间撤销。
- 本轮源码与测试 ESLint、模块依赖门禁、`git diff --check` 通过。
- `pnpm --filter @thesis-ledger/server test`：178 文件通过、15 文件跳过；1241 项通过、49 项跳过。跳过项不计为通过，不替代真实数据库或来源验收。
- `pnpm --filter @thesis-ledger/server build`：通过。

## 未完成边界

没有配置真实证明、部署容器或调用真实 Provider。真实审核证据生产、目标运行态只读文件挂载及撤销演练、独立备用来源准入仍未完成，U04-backup-evidence 父项保持开放。图表 options 仍按主源准入状态显示可用性；备用独立可用性需要结合窗口证明单独验收。其余 M2/M3 与真实数据库、Electron、AI 门禁仍按主 Task 保留。
