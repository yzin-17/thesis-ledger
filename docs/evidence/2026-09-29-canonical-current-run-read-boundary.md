# 当前 Run 读取格式门禁

## 问题与修改

`runs/:id` 原先只核对 `mode='V3'` 与输入外层版本；持久化的旧结果、旧 Snapshot 或错配 RunConfig 仍可能在服务端返回。现增加读取门禁：列表只投影带有效当前 RunConfig、当前结果及匹配 Run/策略/Snapshot/校验和身份的记录；单项读取还核对持久化 RunConfig、冻结 manifest、日期、价格协议、来源、比较指纹及结果归属。旧格式或错配记录返回 `UNSUPPORTED_CONTRACT_VERSION`，不执行任务或改写记录。API Client 使用的响应 Schema 对 `runConfig`、`snapshotManifest` 和 `result` 嵌套字段作当前格式校验。

同一读取门禁还用于运行、重试和取消操作的写入前核验；底层 CAS 的独立证据见[模式 CAS](2026-09-29-canonical-run-mode-cas.md)。

该门禁只验证数据库读取和响应格式，不替代 Snapshot Store 的 Parquet/hash 重放验证；执行与重试仍由现有 Store 校验负责。

## 验证边界

| 检查 | 结果 |
| --- | --- |
| Server 当前 Run 边界及 Controller 定向测试 | 2 文件 17 项通过；包含完整成功结果、旧结果/manifest/RunConfig 拒绝、列表过滤及操作前拒绝 |
| Schemas 回应合同定向测试 | 4 项通过 |
| API Client V3 传输/披露定向测试 | 2 文件 9 项通过 |
| Schemas build、Server typecheck/build、定向 ESLint、`check-boundaries.mjs` | 通过 |
| Server Worker 运行集成测试 | 1 项因所需隔离 PostgreSQL 环境未提供而跳过；未记为通过 |

目标 HTTP、真实客户端及隔离 PostgreSQL 仍待验收；`C02-d`、`C04` 与 `U01` 保持未勾选。
