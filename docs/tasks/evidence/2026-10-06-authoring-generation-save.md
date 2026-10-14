# 策略编写生成与正式保存验收

## 范围

T03-C、T03-G、T04-S 与 G1 受控纵向闭环通过。目标 Docker 升级、在线 Provider、浏览器与后续局部修改验收另行记录。

## 实施

- 用户明确确认目录标的、周期、入场/退出说明、仓位、风险、执行、费用及周期根数；旧草稿可读取，缺少确认不可生成。
- market 负责只读目录解析；生成校验确认约束、原文覆盖、实际定义路径和问题依赖。
- 生成应用绑定修订并保护并发请求，重试返回同一引用。
- backtest 持有正式创建能力与通用来源合同。新增 `20261006030000_strategy_authoring_save` 追加可空所有者和版本来源，保留历史记录。
- 正式保存同事务创建策略 v1、来源快照和草稿终态；审核散列使用 Canonical 序列化，避免 JSONB 键序差异。
- 回测列表、详情与事件流按所有者过滤；历史无所有者记录沿用既有公开访问语义。

## 验证

- schemas build、Server typecheck 通过。
- 定向 Vitest：`authoring-semantics`、`controller-contract`、`model-disclosure`，3 文件 16 项通过。
- 官方维护入口 `IDENTITY_ISOLATED=1 AUTHORING_WITH_REDIS=1 node scripts/test-journal-review-postgres.mjs test/identity/identity-postgres.integration.test.ts test/strategy-authoring/authoring-execution.integration.test.ts`：2 文件 16 项通过。隔离结构为 33 项 migration、80 表；真实 Prisma、BullMQ、独立 Redis 与受控 HTTP 模型使用生产组件。
- 集成覆盖生成/应用、审阅、并发保存与重试、旧修订拒绝、来源写入失败完整回滚、双用户隔离和保存不创建回测。
- 初次集成旧断言未包含描述变更后的 `confirmation: null`；按失效合同更新断言，再运行全部隔离检查通过。

## 后续受控与客户端增量

- 已将旧独立 store 集成入口接入仓库维护的隔离 PostgreSQL；全部当前 SQL、独立 owner/app role 与 Redis 验证。三文件共 31 项覆盖身份、执行及底层事务，隔离资源完成后由维护入口清理。
- 局部修改的确定性允许范围、空变更、范围外变化、旧修订、双用户提案隔离与原子应用已实施；纯函数 7 项及真实执行集成共同验证。
- 客户端确认表单允许未完成输入持久化；实际定义参数及高级 JSON 直接编辑，语义修改要求重新确认，纯格式变化保留审核。实际 React 自动保存 4 项验证合并、晚到结果、失败保留和明确读取服务端修订。
- Desktop 全包首轮 99 文件 666 项通过；职责拆分后 5 文件 32 项定向复验、类型检查与 build 通过。新增回测意图显示的 5 项使用实际 React/TanStack Query，但属于 jsdom 组件证据。
- 本主题源码严格复杂度 20、模块边界和文件尺寸 ratchet 通过。另两个既有回测配置函数的复杂度 32/22 为存量警告，本次仅加入来源意图组件，并未扩展其业务状态；移除了存量嵌套三元文案。

## 当前证据边界

受控模型只证明组件衔接。自由文本规则通过结构化确认、需求覆盖及最终用户审核共同验收，不声称 Schema 证明全部自然语言等价。目标升级、在线调用、进程恢复、真实回测与浏览器未在此证据中通过。
