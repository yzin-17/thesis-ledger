# AC03 目标 Docker 同步

2026-11-22 完成。沿用[现行规格](../../specs/2026-11-20-backtest-practical-design.md)和[补充收尾](2026-11-22-backtest-practical-closeout.md)。本次同步覆盖目标 Server／Worker。

- [x] 同一隔离样本只读核对目标旧产物和本地预备产物，确认同步前目标返回旧诊断、本地修复通过。[同步前证据](../../evidence/2026-11-20-backtest-practical-implementation.md#2026-11-22-ac03-目标同步前核对)
- [x] 用户授权本次重启的正常系统维护写入，正式 `./scripts/sync-code.sh thesis-ledger` 退出 0。Server／Worker 每个 7,107 份构建产物与宿主一致，同一样本通过规则、字段和含预热的原价窗口诊断验收。验收全程只读，模型调用为 0。[同步后证据](../../evidence/2026-11-20-backtest-practical-implementation.md#2026-11-22-ac03-目标同步验收)
