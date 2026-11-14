# 周期复盘当前解读及快照保存

关联规格：[`2026-11-14-journal-period-snapshots.md`](../specs/2026-11-14-journal-period-snapshots.md)

## 阶段与进度
- [x] T01：新增周期快照合同、Prisma 表和新 migration；周期快照与单笔分表存储。
- [x] T02：Server 在 Serializable 事务内重算及校验投影、算法和全集指纹；可选的成功 AI 解读作为不可变 JSON 副本保存，提供账户/模式隔离的历史列表与详情 API。
- [x] T03：周期页仅显示当前 AI 解读；新增显式「保存复盘快照」和 toast，移除本机 AI 历史任务索引、切换和引用按钮，单笔复盘也不再绑定未保存的历史任务。
- [x] T04：历史快照页接入周期快照列表与冻结详情，显示保存时的周期指标和可选 AI 解读；服务层覆盖无 AI、有 AI、失败 AI、证据不一致及账户隔离的回归测试。
- [ ] T05：完成所有门禁、浏览器实际宽屏/窄屏页面验收。当前仅完成编译/静态检查及受控测试，尚未做真实浏览器回归，不能标记完成。
- [ ] T06：按正式 infra 脚本更新目标运行态并验证真实接口/数据库。当前没有执行迁移或 Docker 更新。

## 已执行的检查
- Prisma Client 生成；Schema、API Client 编译；Server、Desktop TypeScript 检查通过。
- Server 定向测试：`test/journal/period-review-snapshots.test.ts`、`test/journal/review-snapshots.test.ts`，11 项通过。
- Desktop 定向测试：`JournalPeriodReview.test.tsx`、`JournalAiResult.test.tsx`，7 项通过。
- Migration matrix：53 条迁移，对应 107 张 SQL 表，全部结构声明覆盖。进一步编译与静态门禁以本任务最新执行结果为准。

## 后续验收
- 前端实际页面桌面/平板/窄屏宽度、按钮禁用和后续 AI 状态、切换账户、历史只读详情。
- 安全地在隔离 PostgreSQL 验证新表、迁移和 API 请求，保证旧单笔快照不受影响。
- 如需同步本地 Docker，必须使用相邻 `thesis-ledger-infra/scripts/update.sh thesis-ledger`，不能使用 `sync-code.sh` 或直接操作容器。

## 约束
- 现有工作区含大量其他未提交修改，全部保留；不提交、不推送、不做无关重构。
- 真实账本数据只读；持久化写入仅按用户交互或隔离样本验证。
