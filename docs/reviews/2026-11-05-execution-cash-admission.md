# 成交写入现金准入验收记录

## 范围与结果

按用户“输入时限制、展示时不限制”的要求及[现行规格](../specs/2026-11-05-execution-cash-admission.md)，补齐 Ledger 成交写入现金校验，保持历史负余额的正常读取和配置展示。[任务](../archive/tasks/2026-11-05-execution-cash-admission.md)已完成全部本地与目标开发运行态验收。

提现和划转原有余额校验保留；新建成交、更正、恢复和移入目标账户统一经过 `execution-write-admission.ts`。新增 `execution-cash-admission.ts` 属于 Ledger，不反向依赖定投或调用方；所有事务写入仍由原账户锁保护。没有 Schema、依赖、数据库结构或收益／配置公式变化。

## 断言核对

| 断言           | 实现与证据                                                                                                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1 原子写入   | 幂等检查之后、追加事件及定投副作用之前读取账户事实，使用既有 `LEDGER_INSUFFICIENT_CASH`；命令单测与真实 PostgreSQL 验证失败不推进事件、持仓、账本版本或定投状态。                               |
| AC2 可用资金   | 复用现金投影和 Decimal，按币种计算已结算现金减待付款，待收款不参与可用额度；覆盖本金加费用、跨币种费用、刚好足额与已存在待付款。                                                                |
| AC3 多入口     | 同一准入覆盖新建、更正、恢复、移入；替代事实按净差额投影，不重复扣旧成交；卖出费用形成净支出也受校验。原幂等重放继续返回原事实。                                                                |
| AC4 历史与时点 | 在当前及明确生效时点核对候选事实，未来到账不能支付过去成交；既有负余额可保持或改善，不能继续恶化；现金快照吸收逻辑不变。                                                                        |
| AC5 消费恢复   | Desktop 真实组件显示中文余额不足原因，保留份额、价格和费用，重试提交同一输入；Mobile 将现金不足与版本冲突区分，避免错误锁住重试。既有历史余额和配置仍可读取。                                   |
| AC6 运行验证   | 通过三个仓库维护的独立 PostgreSQL 入口验证事务与消费；维护脚本同步本地 Server／Worker 后，在强制只读事务中对原两个账户调用新准入，均返回现金不足且原账本版本／记录数不变；真实读取仍为 −82 元。 |

原买入成功夹具此前未提供现金基准，按新输入约束补齐真实资金事实；没有关闭准入或放宽门禁来保留旧成功预期。成交命令内存夹具按共享职责抽出，旧测试文件规模下降；真实数据库成功用例通过原现金命令补充资金。基金定投原先预期负现金的成功样本改为先补足 126 元，确认后余额为零。

## 检查与结果

日志位于 `/tmp/thesis-ledger-execution-cash-admission-20261105/`，所有 pnpm 使用 npmmirror。结果按最后适用输入记录：

- Server 定向：`vitest run test/ledger/execution-cash-admission.test.ts test/ledger/execution-cash-command.test.ts test/ledger/ledger-command.service.test.ts test/ledger/cash-ledger-command.service.test.ts test/fund-plans/recurring-fund-investment.test.ts --reporter=dot`，5 文件 35 项通过。
- `pnpm exec node scripts/test-fund-investment-postgres.mjs`：3 文件 15 项通过。新增本金加手续费不足、补足后同一实例确认、两笔并发支出只有一笔成功；临时容器清理完成。
- `pnpm exec node scripts/test-ledger-current-postgres.mjs`：3 文件 13 项通过。真实 HTTP、幂等、更正、恢复、回滚和信封检查通过；独立数据库与临时容器清理完成。
- `pnpm exec node scripts/test-journal-review-postgres.mjs`：3 文件 8 项通过。复盘消费夹具补足真实资金后，原收益／快照／经济投影断言通过；独立资源清理完成。
- Desktop：`NODE_OPTIONS=--no-experimental-webstorage` 下运行 `account-data-write-recovery`、`account-data.fund-investment`、`performance-ui`，3 文件 38 项通过。
- Mobile：运行 `m10`、`write-recovery`、`occurrence-error` 相关匹配测试，15 文件 37 项通过；`tsc --noEmit` 通过。仅 JavaScript／TypeScript 交互分支，无原生依赖或工程配置变化；没有 Native 编译、重新打包或设备安装验收声明。
- Server `pnpm run build` 通过；随后维护快更入口基于最终源码重新构建 Server 和 workspace 依赖通过。
- 本次文件 ESLint 退出码 0，格式与差异空白通过，`scripts/check-boundaries.mjs` 通过。ESLint import 插件对已有 React Native Flow 入口输出解析诊断，不把此结果扩展为整个 RN 依赖图或 Native 构建验证。

Server 包回归 558 文件中 480 通过、76 跳过、2 失败；4218 项中 3846 通过、370 跳过、2 失败。失败来自本次未修改的迁移输入断言：

- `test/platform/database-structure.test.ts` 仍期望 20261023010000 的 head 与 36 条 migration，实际已有 20261104010000 基金估值 migration。
- `test/platform/database-upgrade-plan.test.ts` 的预期增量列表缺少同一已存在 migration。

没有修改 migration 或放宽断言，也不将全包结果标为通过。隔离 PostgreSQL 的 37 条 migration 实际执行成功，不能用它替代这两项测试自身的失败记录。

## 本地运行态与数据保护

在 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行 `./scripts/sync-code.sh thesis-ledger`，使用已安装 Node 26.13.0 和 npmmirror 配置，退出码 0。兼容性预检通过；本地 `thesis-ledger` 与 `backtest-worker` 重启并健康，镜像 ID 不变，未执行数据库结构或卷变更。快更位于容器可写层，容器重建后会恢复镜像内代码，不记为镜像发布。

运行态核对通过只读 `docker exec` 执行 Node，在 Prisma 事务中强制 `SET TRANSACTION READ ONLY`，调用容器最终构建的真实成交准入函数，不调用追加事件或投影写入：原两个 B2 基金账户均返回 `LEDGER_INSUFFICIENT_CASH`，各有 6 条审计事实，Ledger Revision 保持 6。随后从本机 5173 直连读取真实组合，现金仍为 −82 元。

真实写入及并发验收只发生在维护脚本创建的独立数据库。原验收账户、旧负余额、目标、持仓和现金没有被清理或修正；没有提交、推送、发布镜像或安装手机应用。

## 最终一致性结论

全部本次 AC 已有对应代码与证据，输入限制和历史读取边界一致，无当前范围遗留项。源码指纹与必要日志保存在 `/Users/yzin/.codex/visualizations/2026/11/05/01a1aa9f-a6f8-7631-95a5-5d400a1dc132/execution-cash-admission/`，可重建产物未加入 Git。
