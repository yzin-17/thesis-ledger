# 周期复盘当前解读及快照保存

[现行规格](../../specs/2026-11-14-journal-period-snapshots.md) · [结案证据](../../evidence/2026-11-22-active-task-followup.md#周期复盘与历史标的)

## 阶段与进度
- [x] T01：新增周期快照合同、Prisma 表和新 migration；周期快照与单笔分表存储。
- [x] T02：Server 在 Serializable 事务内重算及校验投影、算法和全集指纹；可选的成功 AI 解读作为不可变 JSON 副本保存，提供账户/模式隔离的历史列表与详情 API。
- [x] T03：周期页仅显示当前 AI 解读；新增显式「保存复盘快照」和 toast，移除本机 AI 历史任务索引、切换和引用按钮，单笔复盘也不再绑定未保存的历史任务。
- [x] T04：历史快照页接入周期快照列表与冻结详情，显示保存时的周期指标和可选 AI 解读；服务层覆盖无 AI、有 AI、失败 AI、证据不一致及账户隔离的回归测试。
- [x] T05 通过宽屏、平板与窄屏实际浏览器验证。初始按钮、冻结两组统计、历史详情和关闭交互通过。保存成功与失败、账户范围和指纹冲突沿用定向回归。
- [x] T06 复用 11 月 14 日正式保数据升级和 11 月 22 日正式快更。现行结构、目标产物、真实周期快照列表及冻结详情通过独立读取，单笔历史同步回读通过。

## 已执行的检查
- Prisma Client 生成；Schema、API Client 编译；Server、Desktop TypeScript 检查通过。
- Server 定向测试：`test/journal/period-review-snapshots.test.ts`、`test/journal/review-snapshots.test.ts`，11 项通过。
- Desktop 定向测试：`JournalPeriodReview.test.tsx`、`JournalAiResult.test.tsx`，7 项通过。
- Migration matrix：53 条迁移，对应 107 张 SQL 表，全部结构声明覆盖。进一步编译与静态门禁以本任务最新执行结果为准。

## 结案核对

2026-11-22 完成。真实页面覆盖 1440、1024、768、390 宽度。隔离 PostgreSQL 应用 53 项迁移，旧单笔快照 4 项通过。目标库独立读回 5 份单笔和 1 份周期快照。写入及冲突分支使用定向测试与隔离证据，目标验收读取已有样本。

## 约束
- 现有工作区含大量其他未提交修改，全部保留；不提交、不推送、不做无关重构。
- 真实账本数据只读；持久化写入仅按用户交互或隔离样本验证。
