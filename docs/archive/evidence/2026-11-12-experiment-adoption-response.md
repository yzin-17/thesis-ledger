# 实验采纳响应修复验收

日期：2026-11-12。对应[规格](../../specs/2026-11-12-experiment-adoption-response.md)。

## 根因和真实状态

原实验 `71bbc0a2-89ae-48eb-938f-0b7e534aecb2` 的候选 1 已由用户提交为正式 v1，版本 ID 为 `e0137741-0f5d-4da1-808b-8eb8852717b8`，采纳记录 ID 为 `0ff38741-e569-4726-8f63-3ada4689aa27`。其策略结构版本为 V3。

`formalizeOptimizationCandidate` 的事务已提交，之后 `adoptionResponse` 调用风险服务生成监控计划。`validatedRiskStrategy` 仍将结构版本限制为 V2，因此抛出“风险应用只能来源于正式 V2 策略版本”，造成已保存却返回失败。此前隔离采纳测试使用风险服务桩，未覆盖这一真实组合，是验证缺口。

## 修复

- 正式 V2、V3 定义都可编译现有风险规则，并核对持久化结构版本与定义一致；实验版本、未知版本、非法定义继续拒绝。研究入场、离场与仓位不转为实际账户风险规则，未创建或启用风险应用。
- 完成候选隔离采纳测试改用真实风险服务和 Controller，验证完整响应 Schema、幂等重放、第二候选正式 v2 发布及前后监控计划。另注入一次提交后响应失败，重试仍复用已提交的同一正式版本。
- Desktop 失败后刷新实验和策略事实；若读到已提交的采纳记录，关闭审阅弹窗并显示“已确认采纳”。没有提交记录时，保留失败提示与审阅内容。

## 本地检查

- Server 定向回归 5 个文件、34 项通过：风险结构、风险预览、账户范围、候选采纳和差异。
- `COMPLETED_ADOPTION_POSTGRES=1 pnpm --filter @thesis-ledger/server test test/strategy-optimization/completed-adoption.postgres.integration.test.ts`：隔离 PostgreSQL 4 项通过，覆盖四类评估终态；无模型 Run、无风险应用新增。隔离资源由现有仓库测试入口创建和清理。
- Desktop 相关回归 2 个文件、10 项通过；Server、Desktop 构建通过；改动文件定向 ESLint 通过。
- 模块边界检查通过；文件尺寸检查通过，另有 5 个既存文件警告。
- 全仓复杂度门禁执行失败：12 个错误、194 个警告。错误位于未修改的 `provider-account-access.ts`、`StrategyBacktestDetailSections.tsx` 和 `use-strategy-submission.test.tsx`；本任务不宣称全仓 lint 通过。

## 本地运行态

在 `thesis-ledger-infra` 目录执行 `./scripts/sync-code.sh thesis-ledger`，退出 0。日志：`/tmp/experiment-adoption-response-sync.log`。Server/Worker 就绪，镜像保持不变，只更新容器可写层，未执行数据库结构或卷变更。

宿主、Server 和 Worker 的 `strategy-risk-plan.js` SHA-256 均为：

`7da7f7170ef7398c8377b8f62248b4bad5e281a008e966aebf354ef7accbdbf1`

使用原采纳记录只读调用响应构造与监控差异查询，完整响应通过 `optimizationAdoptionReadSchema`；返回正式 v1、结构 V3、3% 止损和 10 期持有规则，`riskApplicationEnabled=false`。真实监控计划 GET 接口返回 200。

此次只读运行前后计数一致：采纳记录 2、策略版本 151、模型 Run 41、风险应用 2。未重放真实采纳 POST，未改动用户已有记录。

## 浏览器

实际页面在 1440、1024、768、390 宽度均显示原候选 1“已采纳为正式策略 v1”及已采纳版本入口；候选 2 可打开审阅并取消，无横向溢出或 JavaScript 错误。桌面弹窗与窄屏恢复截图已目视检查。

受控请求分别验证：

- 初始模拟未采纳，提交返回失败，随后 GET 恢复真实已采纳记录：自动刷新事实，关闭弹窗，显示“已确认采纳”，不重复提交。
- 未采纳候选提交返回 409，读取后仍未采纳：保留错误与审阅弹窗，可取消。

两次受控 POST 都在浏览器中拦截，没有发送到服务端；其余验证阻止所有业务写请求。脚本 `/tmp/verify-experiment-adoption-response.cjs`，结果与截图 `/tmp/experiment-adoption-response-qa/`，均为本地临时产物。

## 审查结论

本任务 AC1–AC4 通过；真实已有记录保持不变，没有新增模型调用，没有提交或推送。完整组合测试补齐原验证缺口。本地应用已快更，镜像未更新；全仓 lint 的无关错误保持记录，不扩大通过结论。
