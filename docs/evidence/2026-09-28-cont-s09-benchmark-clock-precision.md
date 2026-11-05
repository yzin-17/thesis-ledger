# S09：V3 Benchmark 估值对齐精确时钟

## 问题与修复

V3 Benchmark 的 `valuationCloses` 可从严格 PIT 收盘事实取得 `decisionAt=availableAt`，但与权益曲线 `occurredAt` 对齐时使用 `Date.parse` 毫秒比较。受控完整快照的回归先复现：把最后一日收盘可用时间设为估值时刻晚一微秒，Benchmark 总收益仍错误地为 `available`。这是计算指标时使用未来价格的风险。

现使用 Schemas 已有的完整小数秒瞬时比较器。非法决策时刻或晚于估值的收盘不计入 Benchmark，沿既有 `BENCHMARK_ALIGNMENT_INCOMPLETE` 和 `INSUFFICIENT_BENCHMARK_POINTS` 路径返回不可用；没有更改冻结输入、V2 语义或费用计算。测试同时验证恰好等于估值时刻的事实可用。严格 PIT 合同在测试中是合成的，只用于隔离计算边界，不代表真实历史归档资格。

## 验证

| 检查 | 结果 |
| --- | --- |
| 新增完整快照回归 | 修前 1 failed，错误结果 `available`；修后同用例通过，晚一微秒不可用、恰好相等可用 |
| Benchmark、V3 Runner、V3 Run 执行定向回归 | 3 文件、31 项通过 |
| Server typecheck/build、修改文件 ESLint、边界、`git diff --check` | 通过 |
| Prettier | 测试文件通过；源码文件仅有既存第 275 行 `priceBasis` 长断言的格式差异，本叶未扩大格式改动 |
| infra `./scripts/sync-code.sh thesis-ledger` | 兼容预检、构建和重启通过；Server/Worker 均 healthy；新增 Benchmark 编译模块的宿主与两容器 SHA-256 同为 `254d97a7e2c30c4c78e9217b6bc3c259b91341f5281fd0616e3b6678bc8b5d92` |

## 边界

官方快更仅更新容器可写层；Server/Worker 镜像仍为 `sha256:82037ac5d35693827d679fc9d8b9341fc52cf13116f28a7095a38660b9a31f9b`。本叶不签发严格 PIT 历史来源、HiThink 单位与 159516 目标准入，也不替代真实普通回测和界面验收。
