# 三仓当前兼容矩阵收敛

## 源码与修改

相邻 infra `compatibility.json` 原先同时登记 DSA Data/Control V1 基线和独立 `marketV3` 块，`scripts/check-compatibility.mjs` 也强制要求 V1。当前 DSA ThesisLedger 专属生产路由与 Server Client 已使用 V3，旧路径只保留拒绝测试；并行矩阵会让发布检查报告与实际运行合同不一致。

矩阵现为 `schemaVersion: 2`、唯一 `dsa.dataContractVersion=3` 与 `dsa.controlContractVersion=3`，发布要求分别固定不可变镜像摘要、合同、协议及正向业务 smoke。检查脚本拒绝旧 `marketV3` 平行块，并验证当前组合。infra `contract-matrix.md`、`README.md`，主仓 `README.md`、`docs/architecture/version-matrix.md` 与运维说明，以及 DSA 当前契约文档均同步说明 V3 URL、独立 Token、部署顺序和验收层级。旧 Market V2 架构说明标记为历史基线；历史证据文件不回写。

## 验证与边界

- `node scripts/check-compatibility.mjs`：通过，输出 Data/Control 版本均为 3 与四项发布要求。
- `node --check scripts/check-compatibility.mjs`、`bash -n scripts/contract-test.sh scripts/market-v3-contract-test.sh`、相关 `git diff --check`：通过。
- 上述为静态版本组合和本地脚本检查。2026-09-29 官方 `update.sh all` 因宿主磁盘耗尽中断，数据库与目标容器未更新；[部署失败证据](2026-09-29-canonical-update-all-disk-blocked.md)继续控制 D01/D02/D03 与 G-Deploy 状态。真实业务、回退及三仓文档终审仍开放。
