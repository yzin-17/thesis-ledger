# 自然语言策略父聚合与保数据验证

## 聚合结果

父对话将工作区 `/Users/yzin/.codex/worktrees/11ea/thesis-ledger` 的 T00/T01-C/R/O/P 底层补丁最小合入主仓。保留当前 Journal、行情周期及 AI 未提交修改；共享 index 仅追加两行，边界脚本仅加入四条禁止反向依赖规则，raw-owned inventory 加入五表，migration matrix 添加本主题记录。Prisma Schema、历史 migration 和锁文件未改。原并行证据保留在[交付报告](2026-10-04-natural-language-strategy-parallel.md)。

完整 T01 仍缺可信身份/API；模型执行、语义转换、正式确认保存、客户端及 G1—G3 继续开放。repository 的 owner 隔离不代表已认证用户隔离；T04 的事务 helper 不代表正式保存业务已经实现。

## 父审阅修正

草稿列表原先以 JavaScript Date 生成游标，会把 PostgreSQL 的微秒 updatedAt 截成毫秒。在同一毫秒内逐条分页时，后续记录可能被错误排除。现在由数据库生成 UTC 六位小数的游标，仍以原始 timestamptz/UUID 复合顺序查询；内部游标字段不进入列表项。真实 PostgreSQL 新增测试验证四条同毫秒记录、同一精确时刻的 UUID 边界、连续四页无遗漏或重复。

主仓使用更严格的复杂度上限 20，首次检查发现新增策略能力校验函数复杂度 29，以及游标投影的未使用变量。能力校验按来源、指标输入与 AST 条件三个领域职责提取纯 helper，保持原验证行为；游标投影显式校验精确 ISO 值。修正后定向 lint/复杂度及 27 项策略合同测试通过，未提高阈值或增加 ignore。

行情装配同步补充了显式 evaluationAsOf 微秒保留与指纹回归，三个行情叶共 52 项通过；它是独立 Market 修改，没有进入本主题持久化。

## 主仓验证

- 编写合同 27 项、repository 两文件 9 项通过；Schema 全包 667 项通过。
- Schema/Server typecheck、Schema/Server build 通过；新增与受影响源码定向 ESLint/复杂度 20、Import boundaries 和文件尺寸 ratchet 通过。尺寸门禁保留 9 个存量告警。
- `check-migration-matrix.mjs`：28 项 migration、76 张 SQL 表、60 个 Prisma model、16 张 raw-owned 表，动态 head 为 `20261004140000_strategy_authoring_records`。
- `check-runtime-database-input.mjs`：全部 28 项 SQL 和运行时执行器打包输入通过；`git diff --check` 通过。

输入未变的旧 Journal 完整回归、目标业务保护、自然语言并行线独立 13 项数据库证据保持原边界，未冒充父复验。

## 父隔离 PostgreSQL

容器 `tl-nl-authoring-parent-20261004` 使用已有 PostgreSQL 17、tmpfs 和回环动态端口；数据库 `nl_authoring_parent`、owner `nl_owner_parent`、受限角色 `nl_app_parent`。测试 fixture 与环境开关只允许该精确容器，不访问目标库或持久卷。

按当前 26 项原 migration 先建立结构、插入旧 Strategy/StrategyVersion，再执行两项新增 SQL。实际 head 与 76 张 public 表符合动态结构输入；旧数据原值保留、受限 app role 权限与全部 repository 场景通过。最终 `NL_AUTHORING_TEST_CONTAINER=tl-nl-authoring-parent-20261004 ... vitest run test/strategy-authoring/authoring-postgres.integration.test.ts` 为一文件 14 项、exit 0，无 skip 或未处理异常。

第一次父运行的 13 项场景通过，身份断言仍写死并行角色名而失败；改为引用专用 fixture 常量后复用同一数据库，14 项全部通过，没有重建库或重复覆盖旧数据。最终检查为 `nl_authoring_parent | nl_owner_parent | 20261004140000_strategy_authoring_records | 76`。随后精确 stop/rm 自有容器，释放 tmpfs 和端口，不删除 volume 或其他容器。

## 目标与后续门禁

目标仍运行此前 26 项结构；两项新增 SQL 未应用，新策略模块也未部署。新增结构输入使后续同步必须重新通过 infra 兼容性门禁，不能用 sync-code 绕过结构升级、直接执行应用 compose/cp，或默认清空已有 Journal/受保护 Ledger。父对话保留目标保数据升级、Server/Worker/缺表日志与健康检查为独立未完成阶段。

回测恢复的排队工作区 `/Users/yzin/.codex/worktrees/44dc/thesis-ledger` 仍无正式 chat 记录，未宣称故障注入执行或创建重复任务。原自然语言并行工作区保留；没有 stage、commit、push 或发往其他 chat 的消息。
