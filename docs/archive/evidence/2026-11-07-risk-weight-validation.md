# 风险权重按规则校验验收

日期：2026-11-07。对应[规格](../../specs/2026-11-07-risk-weight-validation.md)与[任务](../tasks/2026-11-07-risk-weight-validation.md)。

## 实现与消费边界

风险权重保留有限数字格式检查及中文字段错误，移除 0～100% 约束。聚合不截断真实比例，不使用缺失部分持仓权重的残缺集合，账户派生优先使用明确提供的账户权重。未改写原值、估值分母或历史事件。

只有实际评估持仓集中度、行业集中度、资产类型集中度及波动暴露规则时检查权重可用性；相关性只使用收益序列。不可评估返回 `input-unavailable`，其他规则继续；人工测试返回同一中文原因。扫描增加兼容旧响应的 `evaluatedRuleCount`，Desktop 区分无规则、全部失败、部分完成及正常完成，保留事件已写入但通知排队失败的事实。

已检查 Mobile 的 `RiskEvaluateScreen`，现有逐规则错误展示直接消费服务端中文原因，无需修改原生工程。

## 自动验证

| 输入范围                                | 命令                                                                                                                                                                                                                                     | 结果                                    |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| 新权重契约                              | `pnpm --filter @thesis-ledger/schemas exec vitest run test/risk-weight-validation.test.ts`                                                                                                                                               | 11 项通过                               |
| Server 权重、聚合、估值、服务和范围契约 | `pnpm --filter @thesis-ledger/server exec vitest run test/risk/weight-validation.test.ts test/risk/context-decimal-boundaries.test.ts test/risk/valuation-context.test.ts test/risk/services.test.ts test/risk-market-contracts.test.ts` | 53 项通过                               |
| Server 风险相关场景                     | `pnpm --filter @thesis-ledger/server exec vitest run test/risk test/risk-state-machine.test.ts test/risk-market-contracts.test.ts`                                                                                                       | 111 项通过，16 项隔离集成按环境条件跳过 |
| 共享契约整包                            | `pnpm --filter @thesis-ledger/schemas test`                                                                                                                                                                                              | 1487 项通过，3 项跳过                   |
| Desktop 扫描反馈及交互                  | `pnpm --filter @thesis-ledger/desktop exec vitest run test/risk-scan-feedback.test.ts test/risk-actions.recovery.ui.test.tsx test/risk-center-interaction.test.tsx`                                                                      | 44 项通过                               |
| Desktop 整包                            | `pnpm --filter @thesis-ledger/desktop exec vitest run --maxWorkers=2`                                                                                                                                                                    | 261 文件、1670 项全部通过               |
| 受影响包构建                            | `pnpm --filter @thesis-ledger/schemas build`、`pnpm --filter @thesis-ledger/server build`、`pnpm --filter @thesis-ledger/desktop build`                                                                                                  | 通过，Desktop 保留既有包体积提示        |
| 静态检查                                | 修改文件 ESLint、`scripts/check-boundaries.mjs`、新增文件及文档 Prettier、`git diff --check`                                                                                                                                             | 通过                                    |

首次 Server 定向运行有 2 项新增数值断言失败：十进制求和转浮点的末位表示与断言不同；修正测试样本及断言后通过，未改动生产计算精度。首次 Desktop 默认并发全量为 1652 通过、18 失败，位于账户往返、收益工作区和账户筛选；3 文件单独复核 19 项通过，限制并发后的整包 1670 项全部通过。未调整超时、跳过测试或修改这 3 个文件。

## 正式更新与独立运行态

- 执行目录 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`，入口 `./scripts/sync-code.sh thesis-ledger`，默认参数，退出码 0。兼容性预检、宿主机构建及 Server、Backtest Worker 重启健康检查通过；未更新 DSA、数据库结构或外部卷。
- 镜像 ID 保持 `sha256:b1761bc3773061bd94397d7350a17d2657ef93df1355a21acbcaeffccefed35b`。仅同步容器可写层，容器重建后会消失，不代表镜像更新或正式发布。
- 真实只读样本：持仓市值 176.04 元，现金 −82 元，组合总值 94.04 元。运行中容器的已编译 Risk 服务以该样本和内存替身验证：无规则返回 0；真实合并权重 `1.8719693747341555` 可触发集中度条件；缺权重仅影响集中度且价格规则继续；负比例及超过 100% 原值保留。事件和数据库对象均为内存替身，不等同于真实事件持久化验收。
- 真实 HTTP 验证前确认没有启用规则。`POST /api/v1/risk/scan` 使用真实样本聚合比例、模拟模式及空 `security`，返回 201、`evaluatedRuleCount: 0`、空结果；空证券集合不写峰值，全部规则未启用，不写事件或通知。
- 真实 HTTP 的受控非法权重在结构解析阶段返回 400，字段说明“持仓权重必须是有效的有限数字”，未进入业务写入。

## 实际浏览器

本机 Edge／Playwright，`http://127.0.0.1:5173/risk-center`，1440、1024、768、390 × 1000。GET 读取真实页面，扫描 POST 全部拦截为受控响应。每宽验证无规则、全部失败、部分完成及字段格式错误，共 16 场景通过；核对标题、具体原因、事件数量、关闭反馈、页面与 Toast 横向边界及文字裁切。页面异常和漏出的业务写请求均为 0。目视核对桌面部分完成、窄屏失败和平板格式错误截图。

首次脚本未通过角色定位找到现有 Toast 关闭按钮；改用现有 `data-slot="toast-close"` 后完整矩阵通过，未改动共享 Toast。

本机日志 `/tmp/risk-weight-*.log`；运行态结果 `/tmp/risk-weight-runtime-results.json`；浏览器脚本 `/tmp/risk-weight-browser.cjs`；结果与截图 `/tmp/risk-weight-browser-qa/`。未提交或推送，保留共享工作区其他修改。
