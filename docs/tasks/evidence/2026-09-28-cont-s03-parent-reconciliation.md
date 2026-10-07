# S03 版本隔离缓存父项对账

## 完成条件

S03 要求版本/来源隔离的行情事实读写、未知旧身份保真、缺口不扩成完整覆盖、实际 Bar 日期末端命中及 V3 完整响应安全回读。前四类已有 [隔离事实缓存](2026-09-27-s03-cache-postgres.md)和[日期覆盖](2026-09-27-s03-date-cache.md)证据；原先使父项保持开放的是 I01 的完整响应 PostgreSQL 摘要失配。

## 当前源码复验

- I01 已定位 Prisma ORM JSON 参数导致合成响应 22 个浮点位模式 1 ULP 漂移，并改为参数化 JSON 文本写入；[修复证据](2026-09-28-cont-i01-jsonb-orm-fix.md)包括隔离数据库新行、同身份重记、旧空载荷填充零差异及受控 Worker 组合。D01 的[数据库消费证据](2026-09-28-cont-d01-pg-consumption.md)又验证父/子完整响应原样回读和篡改拒绝；本轮[受控 HTTP/Worker](2026-09-28-cont-d01-controlled-http-worker.md)通过实际 Reader/证据仓库、冻结和执行。
- 当前 Server 定向缓存、Reader 与证据仓库五文件为 **36 passed、10 skipped**；跳过的是未提供隔离库环境的 10 项。随后执行 `python3 /private/tmp/goal-s03-date-cache-postgres-20260927.py`，在随机专名、loopback 临时 PostgreSQL 中应用当前 19 份 migration、68 张表和独立 `s03_date_app`，这 10 项实际执行为 **10 passed**。脚本核对数据库/owner/head 后按本轮标签清理，容器无残留。
- Server typecheck 在同一测试变更基线通过。S03 的事实缓存代码和 PostgreSQL 集成测试本轮未修改；I01 修复的 V3 完整响应仓库已在隔离数据库及 Worker 组合复验。

## 状态边界

据此关闭 S03 的本地实现及隔离数据库验证父项。它不宣称本批 Server/DSA 源码已更新到目标容器，不提供真实 HiThink 窗口、严格 PIT 历史来源版本资格或普通真实回测；S04、S05、D01-runtime、G0-H 与全局 AC01–AC20 仍按各自条件开放。2026-09-27 旧证据中的“父项因 I01 开放”是当时状态，不回写历史结果。
