# 回测生成表达式与固定版本七例复验

关联 [任务归档](../archive/tasks/2026-11-21-backtest-final-seven-recheck.md)、[当前合同](../specs/2026-11-20-backtest-practical-design.md) 与 [v26／v34原始失败](2026-11-22-backtest-linked-coverage-recheck.md)。私有材料位于 `var/acceptance/backtest-practical-20261120`。

## 零调用验证与修复

Server的独立原意成对测试证明，恒假普通退出不能用行情与零比较，百分比跳空不能用绝对价格差，触发和捕获即使形状一致也必须排除当根。Domain交易计划成对运行使用首笔102成交与持仓均价100，保护线为96.9，96.91未触发，96.9触发退出。先完成这两组零调用检查，分别33项和9项通过。

探索以冻结来源的字段与周期选择参考，并保留完整原生及可见Schema、原来源能力合同。生成说明逐个明确无普通退出的常量结构、比例偏离的除法及减一、此前完整窗口向前一根、捕获完整触发操作数。计划修改的说明明确收盘达到或低于保护线（含等值），首笔成交价与持仓均价分别表达。生成结果、编译器与模拟器读取方式保持。

Server相关五文件49项、Domain构建、Server类型以及lint／边界／尺寸通过，保留旧四批28份独立零调用对照。七例预检 `v27-seven-preview1` 退出0、实际调用0。与v26／v34预检相比，七例用户消息和冻结数据范围一致。会话编写的提示原文一致，止损修改的系统消息明确等值触发。整体字节数按实际内容估算。

## 同步与正式复验输入

在infra目录以Node.js 24.22.2及工作区npm镜像执行 `./scripts/sync-code.sh thesis-ledger`，退出0，日志 `t13-v27-sync-code.log`。随后在主仓执行 `node scripts/local-runtime/run-backtest-practical-readonly.mjs <t13-v27-target-before.json> thesis-ledger-dev-thesis-ledger-1 thesis-ledger-dev-backtest-worker-1`，退出0。两服务编译产物与宿主一致，旧冻结股票在两服务分别重放两次。可写层更新，镜像保持，目标NAV历史样本仍缺失。

预先固定的版本为 `strategy-optimization-v27-scoped-expressions`／`authoring-prompt-v35-stop-boundary`，文件5245份，`v27-seven-final-source-before.json` 摘要为 `d1e4f725d2d498c88e54974c713ec402234415b0cb6b475d99b163b4177f8b8a`。

在infra以正式 `locked --idle` 装配 `scripts/local-runtime/run-backtest-trade-plan-acceptance.mjs` 及专属隔离库，场景 `backtest-practical-v6`，输出 `v27-seven-final1`，授权登记 `2026-11-22-user-approved-600-scoped-expressions-seven`。本批七例各一次，上限7，原模型、原生Schema及 `v6-qualification-cache1`。累计轮前55／600、余额545，无新增探针或自动重试。未知结果、路由或资格变化时停止。

## 真实结果

隔离入口退出1，七次实际请求全部响应，正式编译及独立原意检查均7／7，冻结执行6／7，核对原始说明后完整业务4／7。前后5245份文件的摘要一致。模型、合同和实际消息核对见 `version-route-review.json`，逐例结果见 `business-review.json`。累计业务调用62／600，余额538，探针0、重试0、未知0。

带宽与跳空、冻结前高、仅后复权、仅加止损四例完整通过。止损原始说明准确写出即时启用、首笔成交价锚定、达到或低于保护线以及下一可交易开盘，保留基线。计数恒假退出和多周期累计的AST、原意与冻结执行通过，但模型说明分别把 `gt` 称为“上穿”和“突破”，需要修正两处回读。会话例的VWAP、覆盖和时钟正确；原生输出选择 `actual`，本次只有 `research` 分钟窗口，隔离创建后被冻结范围检查拒绝。此批结论保留，完整门禁未通过。
