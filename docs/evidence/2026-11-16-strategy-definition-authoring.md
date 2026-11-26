# 策略定义统一与双向编辑实施证据

对应[规格](../specs/2026-11-13-strategy-definition-authoring.md)与[任务](../archive/tasks/2026-11-13-strategy-definition-authoring.md)。

## 基线与边界

2026-11-16 复用共享 `main` 工作区，保留全部既有未提交变更。之前复核末次 5 文件/45 定向用例通过，输入及限制见[适配报告](../archive/reviews/2026-11-16-strategy-definition-authoring-plan-fit.md)。这不是本轮后续源码的验收结果。

本轮按已确认合同实施，不自动启用模型用途、不修改真实策略记录、不改写历史冻结输入，不创建 Git 提交。新增验证结果在对应交付后登记。

## 规划预检

规格新增 AC01～AC09 和当前编辑覆盖合同；任务按共享合同、双端消费、协议与执行、独立部署门禁拆分，保留既有能力扩展和子任务范围。当前完整回读、共享草稿和普通保存不依赖新坐标上线，可以先推进；拒绝旧写入门禁依赖运行消费者就绪。

## 已实现的编辑链路

Domain 新增独立 JSON 对象解析、不可变路径修改、来源引用遍历与原子改名、引用删除保护、显式复制执行标的/主周期及共享字段合同。Desktop 与 Mobile 消费同一合同，覆盖当前 AST、来源、仓位、风险、执行、费用、基准及已交付交易计划；数组支持增删与顺序调整。未知节点/字段、业务未完成对象和长十进制原文保留；严格业务校验只用于提交。非法 JSON 不离开文字页签，也不提交旧结构草稿。普通保存不再调用研究投影。

完整中文回读补齐 MACD 命名参数及输出、布尔分组、来源身份/周期/坐标、交易计划和基金实际份额。新建与研究预览仍分别负责生成定义与显式研究转换。

本轮首批定向检查：Domain 25 例、Desktop 既有交互 19 例及新编辑往返 3 例、Mobile 25 例通过。后续协议、写入门禁及补查结果分别记录在下文，不以早期结果替代最终检查。

## 浏览器受控检查

真实生产组件由隔离宿主加载，所有业务接口拦截为受控样本，不写真实记录。股票/ETF × Desktop/Mobile Web × 1440、1024、768、390 宽度，共 16 组：非法 JSON、未完成/未知内容、精确小数计划编辑、来源改名、引用删除保护、JSON 往返、提交前后溢出与页面错误检查均通过。最终补查还验证文字框聚焦、来源分组展开/收起，Desktop 取消后选择继续编辑保留草稿。截图、实际提交的 `*-saved.json` 和结果位于 `/tmp/strategy-definition-editor-20261116/`。命令为仓根 `node scripts/local-runtime/strategy-definition-editor-browser.mjs`，退出 0、16 组通过；这不代表原生设备或部署环境验收。

巡检发现并修复：分组错误信息误用字段上下文、Mobile 搜索框空字符串作为原生子节点、重复展开标题、标量数组布局过长、隐藏提交回执撑宽页面。首次 Mobile 测试未限制目录，误收集归档发布副本并出现 4 条缺失历史依赖错误；随后限定 `--dir test` 的目标 25 例通过。边界检查首次发现测试宿主跨应用静态导入，改用独立宿主后 `Import boundaries: OK`。

## 协议、基金与新写入

Schema 3 新增 `run` 与 `native-nav`：显式升级仅改变协议和来源坐标，场内沿用运行绑定，基金使用发布单位净值。历史 Schema 2 定义、摘要和运行载荷不回填。研究资格改为检查执行模式和来源坐标，不能仅凭 Schema 3 推断研究价格/单位。

基金准备、提交、Worker 装载及读取允许匹配的 2/3，继续校验原定义摘要；存储元数据与载荷协议不一致在取数前拒绝。运行绑定利用既有冻结协议，不改变 Run/Snapshot 版本。定向 Server 5 文件 77 例通过，包含 Schema 3 NAV HTTP 准备/冻结/提交/读取、队列不可用、Worker 重复投递，以及非空申赎样本的请求、确认、份额、现金与离线回放等价。

新增 Worker 等价测试最初误认为原准备样本会成交，连续两次断言发现其请求为空；保留该样本验证生命周期，另用已有非空冻结样本完成经济等价断言，未放宽非空标准。

新写入门禁已接入手动新建/发布、AI 审核保存、候选持久化及采纳；不把历史候选在采纳时静默转写。旧写入返回 `STRATEGY_DEFINITION_UPGRADE_REQUIRED`，历史幂等回执和摘要读取沿用原合同。探索种子均使用 3；基金使用 `native-nav`，场内研究投影仍是显式路径。新 AI 完整编写合同限定 3，局部修改保持原版本；用途配置版本沿用 v5，未调用真实模型或启用路由。

Server 写入/探索/采纳/风险/编写定向 6 文件 52 例通过；Schemas 升级/编写/研究合同 5 文件 42 例通过。历史 V2 采纳成功断言按新门禁改为验证拒绝且没有写入；Schema 3 仍验证原样采纳。风险选择新增共享能力判断，两端不再仅筛选 Schema 2；技术离场、研究阈值不映射为账户风险。

补查 AI 编写消费入口后，两端增加历史草稿的显式升级操作，并清除旧确认、要求重新审核；局部模型修改仍保留原协议，不能借升级按钮扩大模型获准修改的路径。计划差异预览按实际研究资格显示单位，不能将所有 Schema 3 显示为研究单位。Desktop 编辑与编写合同 2 文件 19 例、Mobile 编辑合同 4 例通过。首次新增 Desktop 升级样本误含 AI 当前不支持的多来源，另有 3 条既有状态样本缺少 `allowedPaths`；修正受控输入后通过，未放宽业务校验。

## 包级、冻结与隔离运行验证

以下命令使用工作区现有依赖，不调用外部模型；隔离脚本通过仓库维护入口创建并清理专用 PostgreSQL/Redis，不连接真实业务数据库。

| 执行目录 | 命令 | 结果及边界 |
| --- | --- | --- |
| `packages/domain` | `pnpm test` | 104 文件、946 例通过；后续仅收紧草稿辅助函数的类型防护，相关两文件 21 例再通过。 |
| `packages/schemas` | `pnpm test` | 158 文件、1650 例通过；后续修复一条既有测试的未使用解构变量，相关交易保护 8 例再通过。 |
| `apps/server` | `pnpm exec vitest run test/backtest/v3-runner.test.ts` | 9 例通过；股票、ETF 均有非空成交，2→3 升级后的成交/交易/权益/指标/基准一致，原摘要及两边重复回放稳定。 |
| `apps/server` | `pnpm exec vitest run test/backtest/services.test.ts` | 新建、目录投影及正式版本发布 3 例通过；旧父策略可发布新的 Schema 3 版本。 |
| 仓根 | `node scripts/test-strategy-definition-runtime.mjs` | 4 文件、25 例通过；隔离 NAV 真实保存→准备→BullMQ→独立 Worker→结果读取，另含已完成采纳及并发一致性。 |
| 仓根 | `node scripts/test-experiment-price-research-runtime.mjs` | 1 例通过；受控行情的实际 HTTP/BullMQ/独立 Worker 计算、持久化及离线重放。没有外部 AI 调用。 |

NAV 非空申赎经济等价由离线样本另行验证；不能将准备样本的空成交终态充作非空经济证据。股票和 ETF 的升级等价使用同一合成归一化执行上下文，不宣称覆盖尚未提供的其他价格协议。

完整静态检查首次因默认堆上限约 4 GiB 在 Desktop 阶段退出；提高到 8 GiB 后暴露的实际类型/未使用变量检查已逐项修正。Mobile 导入解析器会打印 React Native Flow 文件诊断，退出结果单独记录，不将诊断文本本身当作 lint 失败。共享工作区的一条交易计划测试辅助函数随后暴露两个类型错误：执行模型可选类型及研究/普通样本的联合类型；按当前接口修正，同时将其研究判断改为实际坐标资格。最终检查结果在部署段记录。

## 目标部署与独立核对

部署前，仓根 `NODE_OPTIONS=--max-old-space-size=8192 node scripts/lint-workspace.mjs` 退出 0，9 组、4099 文件通过。Server 及依赖构建、Desktop 构建和 Mobile 类型检查通过；导入边界、8 包依赖图、文件规模及 `git diff --check` 通过。受上述辅助函数影响的计划、月末及波动率 Worker 三文件 5 例回归通过。后续新增的纵向验证文件另行执行定向类型及 lint，不将其计入这次整仓文件数。

执行目录为 `../thesis-ledger-infra`，正式入口 `./scripts/sync-code.sh thesis-ledger`；仅在 PATH 补充 `/Applications/Docker.app/Contents/Resources/bin`，没有关闭预检或数据库门禁。首次退出 1：另一项正在执行的正式验收持有维护锁，未修改容器；等锁正常释放后重试退出 0。兼容预检通过，宿主重建应用产物并同步 Server/Worker，两个镜像 ID 保持不变，未执行数据库结构或外部卷变更。快更位于容器可写层，重建容器会恢复镜像内代码。

随后在同目录执行 `node scripts/infra.mjs locked --idle -- node /Users/yzin/code/thesis-ledger-workspace/thesis-ledger/scripts/local-runtime/strategy-definition-runtime-check.mjs /Users/yzin/code/thesis-ledger-workspace/thesis-ledger/var/acceptance/strategy-definition-target-20261116`，退出 0。两个实际容器各 25 个关键模块与宿主构建摘要一致；分别核对场内/NAV 的显式升级、新定义原样保存合同、旧定义稳定拒绝码、旧摘要不变、未知字段/精度及引用保护。回执为 `var/acceptance/strategy-definition-target-20261116/receipt.json`，业务数据库写入 0、模型调用 0。

实际 Worker 日志确认 `backtest.worker.ready`、队列 `backtest-run`，该检查窗口内没有 `backtest.worker.error`。只读 readiness 请求返回 200，三项策略用途仍为 v5、`ready`/`passed`；没有变更用途配置或真实路由。此状态仅是当前配置读数，不能充作本轮新版生成合同的新增真实模型验收。

## 同一编辑定义的股票与 ETF 纵向验证

在仓根执行 `node scripts/test-strategy-definition-roundtrip.mjs /tmp/strategy-definition-editor-20261116`，仅在 PATH 补充 Docker CLI，退出 0、两例通过。该维护脚本要求浏览器保留实际提交原文，再经既有隔离 PostgreSQL/Redis 宿主及独立实际 Worker 验证；总超时 180 秒，资源在成功或失败后清理。

每个资产样本均验证：Desktop 与 Mobile 实际提交 JSON 相同；通过正式 `StrategyCreationService` 原样保存为 Schema 3；MACD 零轴与上穿条件、ATR 初始保护、减仓数量基数和长十进制费用/比例保持原文；运行准备、HTTP 投递、BullMQ 领取及真实 Worker 终态成功且成交非空；冻结定义摘要等于提交原文摘要，版本记录及中文回读不变，两次完整离线重放与持久化结果相同；读取结果成功，真实账本事件及持仓表写入均为零。

失败保留：首次非零 MACD 价格阈值样本触发价格口径混用保护，改为零轴判断后再验证，高精度值保留在费用/阶段数量中；新宿主最初遗漏父进程所需隔离配置，随后子进程测试密钥长度不足导致处理器启动失败、任务停留 queued。补齐隔离配置和合法测试密钥，增加子进程诊断后修复；第二资产允许真实 Worker 已领取的 `active` 状态，最终仍严格要求成功终态。首日交叉样本连续出现空成交，未放宽非空断言；将跨越安排在运行窗口第二个评估周期后通过。期间曾将空成交归因于前值相等，源码核对后更正：上穿允许前值相等，要求当前值严格大于。没有修改交叉语义或执行引擎。

新增纵向文件已通过 Server 全量类型检查及自身/受影响 fixture 的 lint；仓库导入边界和文件规模再次通过。部署后的新增内容为受控验证脚本、测试输入及文档，未新增产品运行逻辑。

## 当前未验收层

当前已具备股票/ETF 非空升级回放、同一浏览器提交定义的隔离完整纵向运行、NAV 保存/实际 Worker、两端 Web 及目标容器证据。随后按用户授权补充 iPhone Air、Android 实际原生交互，修复草稿缓存后通过。首次真实模型两份因输出长度和缺失计划失败，原始结果保留在[原生及模型证据](2026-11-16-strategy-editor-native-model.md)。继续授权复核修复后，相同自然语言、原模型及路由的一次资格与两次生成均通过；正式校验、隔离保存、冻结执行、重复回放、中文及两容器 28 模块核对通过，见[模型修复重验](2026-11-16-strategy-authoring-model-repair.md)。T07/T08、L04a 完成各自限定边界；G03、L04 及其余独立扩展继续开放，剩余按活动任务的其他能力、语义与运行门禁逐项完成，不把本批回执推广为随后共同合同变更的验收。
