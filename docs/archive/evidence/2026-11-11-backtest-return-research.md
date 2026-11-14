# 策略收益研究双价格实施验收

日期：2026-11-11。对应[有效规格](../../specs/2026-11-11-backtest-return-research.md)、[归档任务](../tasks/2026-11-11-backtest-return-research.md)和[使用指南](../../guides/2026-11-11-backtest-return-research.md)。本记录仅证明首次验收范围；15:57 用户报告的单侧来源失败及原任务完整窗口由[追加验收记录](2026-11-11-backtest-price-pair-recovery.md)说明。

## 交付与边界

普通新建股票／ETF 日线回测使用 `price-research-v1`：后复权用于研究操作、估值、指标与基准；按需读取不复权参考，用于具体价格条件及参考份数的投入计算。策略 Schema V3 保存来源坐标，旧版本通过显式预览另存。运行配置、快照、结果保留 V3 信封，未携带子协议的历史载荷不增加默认字段。

固定份数 Q 在下一会话开盘用原价 R 确定计划投入 Q×R，再以当时后复权价 H 换成研究单位。复用 Decimal 和既有归一化账本、费用、结算、任务投递及 attempt 原子提交。普通研究不调用公司行动或因子端点。缺原价会话以不可用点保存，不借前一日价格确定投入；结果披露缺日数量及未执行原因。

原价参考跟随后复权实际选中的精确来源；该目标必须已在原价的有效路由中配置并准入，保留其原主备索引，失败不改读其他提供方。此约束同时覆盖在线读取、冻结读取、快照校验与结果来源披露。没有修改真实路由。

现行带日级交易状态的 V3 行情响应仍要求正成交量；该来源层合同没有放宽。收益研究不恢复真实股数、权益到账或真实可用现金。公司行动事件信号仍在准备前具体拒绝。

## 分层验证

| 范围           | 命令或入口                                                                                                                                                                           | 结果                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Schemas        | `pnpm --filter @thesis-ledger/schemas test`；最后价格投影定向测试                                                                                                                    | 全包 136 文件、1521 项通过；追加零轴规则后的定向 5 项通过                                                         |
| Domain         | `pnpm --filter @thesis-ledger/domain test`                                                                                                                                           | 71 文件、799 项通过                                                                                               |
| Server         | `vitest run test/backtest test/market test/strategy-authoring`                                                                                                                       | 244 文件、2032 项通过；19 文件、91 项按原环境条件跳过                                                             |
| Desktop        | `pnpm --filter @thesis-ledger/desktop test`                                                                                                                                          | 300 文件、1912 项通过                                                                                             |
| Mobile         | `pnpm --filter @thesis-ledger/mobile test`                                                                                                                                           | 59 文件、247 项通过，含明确另存版本后提交及失败保留输入                                                           |
| DSA            | `.venv/bin/python -m pytest -q tests/test_thesis_ledger_research_calendar_binding.py tests/test_thesis_ledger_futu_capability_path.py tests/test_thesis_ledger_research_calendar.py` | 98 项通过；两条现有第三方弃用警告                                                                                 |
| 编译           | Schemas、Domain、API Client、Server、Desktop build；Mobile typecheck                                                                                                                 | 通过；未修改原生依赖或配置，未把这些检查当作 Native compile                                                       |
| 架构           | `node scripts/check-boundaries.mjs`；`GUARDRAIL_BASE_REF=HEAD node scripts/check-file-size-guardrails.mjs`                                                                           | 通过；6 项既有尺寸警告均未增长                                                                                    |
| 静态检查       | 本次相关 Server／Market／Schemas／Domain／Mobile 542 文件的 ESLint                                                                                                                   | 0 错误；Desktop 本次代码无错误                                                                                    |
| 全仓复杂度入口 | `node scripts/lint-workspace.mjs --guardrails`                                                                                                                                       | 未全绿：未修改的 `use-strategy-submission.test.tsx` 有 10 处既有 `require-await` 错误；保留此限制，不计为本次通过 |
| 差异卫生       | `git diff --check`                                                                                                                                                                   | 通过                                                                                                              |

研究快照的最终 9 项定向测试覆盖：纯指标仅一套行情、指标零轴不要求原价转换、来源冲突、双价格冻结、断开 Provider 后回放、原价改动拒绝、操作时点缺价不执行，以及四种投入方式的整体后复权缩放。固定金额和参考份数保持一致；比例及权重模型使用原有 40 位除法精度，权益、指标和费用的比较容差为 10⁻³⁰，不改写或舍入存储值。零轴规则追加后，Domain 全包 799 项重新通过，价格投影 5 项及研究快照／来源选择 33 项通过；此前有效且输入不受影响的其他检查复用原证据。

## 实际 Worker 与浏览器

`PRICE_RESEARCH_WORKER_ISOLATED=1 pnpm --filter @thesis-ledger/server exec vitest run test/backtest/price-research-worker.integration.test.ts` 通过。测试使用独立 PostgreSQL／Redis 临时容器、真实编译 Controller、BullMQ 与生产 Worker 入口，完成 HTTP 创建、等待队列、attempt=1 领取、实际 Domain 计算和结果保存；断开 DSA 后重放 checksum 一致。HTTP 访问范围为测试桩，身份权限由原有测试覆盖。隔离库的 LedgerEvent／Position 保持为空，测试资源已清理。

浏览器入口为 `apps/desktop/scripts/check-price-research.cjs`，使用 `test/price-research.vite.config.mjs` 启动当前源码。1440／1024／768／390 四种宽度各覆盖设置、结果、编辑和手机组件，共 16 组：旧版本另存确认、后复权与子协议提交、503 输入保留、交易表格、图表、CSV 下载及高级 JSON 应用。已检查截图、页面边界和横向溢出。API 全部由受控响应接管，真实业务写入为 0。手机展示使用实际业务组件及 React Native Web，原生运行环境仅替换主题边界；这不代表设备端或 Native 编译验收。

浏览器回执、16 张截图和四份 CSV 位于 `/tmp/price-research-qa/`，临时产物不进入 Git。Playwright 使用已有主运行时依赖，浏览器为 Microsoft Edge。中断的隔离测试通过带名称、标签、进程和无持久挂载校验的 `cleanup-backtest-test-resources.mjs` 清理；其保护测试通过。

同一浏览器入口另以 `--live-readonly` 访问当前实际 Vite 应用 `http://127.0.0.1:5173/strategy/library/new`。四种宽度均确认默认策略版本为 3、来源坐标为 research，实际页面无横向溢出和脚本异常；没有发起业务写入。回执为同目录的 `live-receipt.json`，截图为 `live-editor-<宽度>.png`。Server 的 3000 端口只提供 API，不把它的根路径当作 Desktop 静态服务。

## 运行态与真实来源

从 `thesis-ledger-infra` 目录使用 Node.js 24.22.1 执行 `./scripts/sync-code.sh all`，随后按实际来源选择修正和最终投影变更分别执行最小目标 `./scripts/sync-code.sh thesis-ledger`，均退出 0。兼容性预检、源码同步与服务就绪通过。DSA、Server、Worker 健康，镜像 ID 保持不变，未执行数据库结构或卷变更；更新位于容器可写层，不能视为镜像重建或生产发布。

最终独立检查比较宿主构建输出与 Server／Worker 各四个关键文件（来源选择、双价格读取、规则兼容、策略投影）的 SHA-256，以及 DSA 四个变更绑定文件的 SHA-256，12 项均相同。实际 Desktop 页面读取当前源码，构建输出另外通过生产 build 检查。

真实只读准备使用维护入口：

```sh
node scripts/local-runtime/verify-price-research-live.mjs --output /tmp/price-research-live-paired-20261111.json
```

入口核对目标容器身份和已应用路由，直接复用运行态的准备函数与统一 Reader。仅在内存中构建价格条件和固定参考份数策略，不保存正式策略版本或回测任务；正常行情证据允许由 Reader 持久化。前后核对策略、版本、任务、账户、账本和路由表内容摘要。

2026-11-11 15:16（北京时间）的最终结果：

| 标的      | 请求区间                 | 后复权／原价 | 来源                                            | 准备状态 |
| --------- | ------------------------ | ------------ | ----------------------------------------------- | -------- |
| 510300.SH | 2026-10-10 至 2026-11-10 | 各 28 根日线 | 两者均为 EFinance／Eastmoney，原配置备用索引 1  | prepared |
| 600519.SH | 2026-10-10 至 2026-11-10 | 各 28 根日线 | 两者均为 HiThink／hithink-financial-api，索引 0 | prepared |

600519 的上市日期保持 unknown。两套窗口分别取得冻结身份和响应摘要；路由版本保持 197，`businessStateUnchanged=true`，新建业务任务／研究版本均为 0。此前独立主备选择造成的 510300 同源失败已由成对来源约束修复并通过同窗口复核。原始回执保存在上面的绝对路径。

此证据证明所列窗口在当时账号、路由与来源状态下可完成新模式准备；不代表真实账户现金还原、全部市场／时期来源可用、原事件策略已经改写，或历史失败任务已重新执行。

## 最终一致性

AC1 对应保存预览、坐标测试与两端提交测试；AC2 对应按需读取、来源约束、缺价处理及 DSA 测试；AC3 对应投入、费用、缩放与开盘时序；AC4 对应完整快照、受控数据库／队列／Worker 及离线重放；AC5 对应双端结果、图表、CSV 和历史协议回归；AC6 对应独立浏览器、维护同步与代表窗口真实准备。规格、领域词汇、当前设计和指南已对齐，任务可归档。全仓 lint 的既有失败及设备／镜像验证边界按上文保留。
