# 专项脚本归档

以下脚本保存已结案任务的复现关系，不由日常运行入口自动执行。历史目标、预算和数据副作用仍然有效；运行前必须重新核对目标和授权。

| 原任务 | 归档文件 | 保存范围 |
| --- | --- | --- |
| [公告准备验收](../../docs/archive/reviews/2026-10-08-announcement-preparation-acceptance.md) | `2026-10-08-announcement-preparation/announcement_preparation_target.py`、`announcement_restart_target.py` | 固定业务目标准备及重启验收；可能访问数据库、队列和研究服务 |
| [统一回测 V2](../../docs/archive/tasks/2026-08-28-unified-backtest-v2.md) | `2026-08-28-unified-backtest-v2/backtest-v1-inventory.mjs` | V1 遗留扫描；提供 `DATABASE_URL` 时包含数据库只读盘点 |
| [策略交叉方向](../../docs/archive/tasks/2026-11-12-strategy-cross-direction.md) | `2026-11-12-strategy-cross-direction/strategy-cross-repair.mjs`、`strategy-cross-repair.test.mjs` | 交叉修复及其合同，测试由 CI 显式保留 |

离线合同命令：`node --test scripts/archive/2026-11-12-strategy-cross-direction/strategy-cross-repair.test.mjs`。V1 代码盘点可用 `DATABASE_URL='' node scripts/archive/2026-08-28-unified-backtest-v2/backtest-v1-inventory.mjs`，不将此结果作为数据库验收。
