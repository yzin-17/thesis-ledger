# Arena 配置回读复杂度告警修复

日期：2026-11-15。来源：[实验详情状态隔离验收中的全仓告警](2026-11-15-experiment-detail-scope-isolation.md)。用户授权修复该项告警，保留并行修改，禁止模型调用、真实业务数据写入及削弱验证。

## 修改范围与行为

仅从 [arena-live-plan-display.ts](../../../packages/domain/src/arena-live-plan-display.ts:12) 的 arenaDecisionPlanLines 提取私有 cancellationPlanLine，负责查找撤单对象并说明撤单影响。原撤单文案、未知委托回退、保护子单与入场父单的判断顺序、输出顺序、新委托和分档保护逻辑保持原样。没有修改导出接口、交易状态机、撮合行为或持久化合同。

源文件沿用并行工作区实现，不进行整文件格式化或重置。新增 [arena-live-plan-cancellation.test.ts](../../../packages/domain/test/arena-live-plan-cancellation.test.ts) 的六项测试，覆盖账户不可用、委托缺失、普通撤单、父单撤销保留已激活保护、子单撤销导致余仓失去保护，以及多撤单与新委托的精确回读顺序。测试同时验证输入未被修改；全部既有测试断言保持。

## 验证结果

所有命令在主仓执行，使用已安装依赖，环境包含 PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false、PNPM_CONFIG_REGISTRY=https://registry.npmmirror.com。

| 检查 | 结果 | 日志 |
| --- | --- | --- |
| 修复前 eslint，complexity 20、--max-warnings 0 | 确认 arenaDecisionPlanLines 复杂度 21，失败原因正是原告警 | /tmp/arena-plan-complexity-before.log |
| 新增测试首次编写 | 28 通过、1 失败；新样本预期误写“限价单”，按共享显示映射修正为“限价”，未修改产品文案或既有断言 | /tmp/arena-plan-before-tests.log |
| 修复前行为基线：五个计划回读、部分成交和分档测试文件 | 29 项通过 | /tmp/arena-plan-characterization.log |
| 修复后相同五文件、相同断言 | 29 项通过 | /tmp/arena-plan-targeted.log |
| pnpm --filter @thesis-ledger/domain test | 85 文件、873 项通过，无失败、跳过或待办，包含新增六项 | /tmp/arena-plan-domain-tests.log |
| pnpm --filter @thesis-ledger/domain build | TypeScript 编译通过 | /tmp/arena-plan-domain-build.log |
| 两个受影响文件 eslint，--max-warnings 0，complexity 20、max-lines-per-function 220 | 零错误、零告警 | /tmp/arena-plan-lint-final.log |
| NODE_OPTIONS=--max-old-space-size=8192 pnpm guardrails:complexity | 8 组、3950 文件，零错误、零告警；文件尺寸无告警 | /tmp/arena-plan-guardrails.log |
| node scripts/check-boundaries.mjs；git diff --check | 通过 | /tmp/arena-plan-boundaries.log；本次终端结果 |

Node 堆预算沿用前轮全仓检查的 8 GiB 执行设置；没有修改任何规则、复杂度／尺寸阈值、ignore、既有断言或测试启用条件。全仓检查保留既有 React Native 依赖解析诊断，最终 ESLint 告警为零，不将原始依赖诊断误计为产品复杂度告警。

## 保护与结论

该项复杂度告警已消除，新增回归及现有领域包回归通过。原实验详情验收中记录的一项 Arena 告警是当时扫描事实，后续修复由本记录承接。没有调用模型、Provider、通知或真实业务 API，没有连接业务数据库、部署、业务服务重启、暂存、提交或推送，也没有改动其他并行任务实现。纯回读函数保持既有输出，未改变页面结构或样式；本次结论限于源码、领域回归、编译与工程门禁，不宣称目标运行态已更新。
