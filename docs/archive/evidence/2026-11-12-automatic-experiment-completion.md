# AI 实验自动完成验收证据

## 范围与基线

用户要求创建后直接运行到完整结果，最终决定是否采纳。当前等待阶段由客户端提交批次推进，恢复器只处理排队、运行和已领取测试，候选阶段结束后会停留等待。

实施按[规格](../../specs/2026-11-12-automatic-experiment-completion.md)执行；结案状态由[任务](../tasks/2026-11-12-automatic-experiment-completion.md)维护。现有工作区有其他任务修改，逐项保留和归属。

## 实现与状态保护

- 封存编排提取到 `OptimizationFinalization`，拥有锁定、领取、技术恢复与统一揭示；生成和正式采纳继续由原服务负责。主服务体积降低，尺寸门禁的既有告警从六项降为五项。
- 候选阶段通过状态及 `executionAttempt` 原子收敛后，立即锁定全部有效候选，自动完成测试。新增 `/complete` 只接收实验身份；技术重试复用原锁定集合、历史提前选择和已完成结果。
- 恢复器新增尚未锁定且没有技术失败原因的等待实验，覆盖候选结束与领取之间退出的间隙。技术失败保留原因并暂停，避免无限重试。测试终态写入与读取保护沿用 attempt、取消及冻结事实门禁。
- 完整预算按 `3 + 3 × 模型数 × 最大轮数` 校验，保留零值不限额及现有额度。Desktop／Mobile 正常流程通过查询轮询等待完整结果，最终采纳保留审阅和明确确认。

## 定向与隔离验证

| 验证范围 | 结果与边界 |
| --- | --- |
| Server 候选阶段与接续定向测试 | 2 个文件、7 项通过；包含旧 attempt 不得推进阶段 |
| Server `test/strategy-optimization` 回归 | 37 个文件、177 项通过；14 个文件、55 项按配置跳过，跳过项不计通过 |
| 正式隔离 PostgreSQL T06 | 7 项通过；实际执行 50 项 migration 后测试并清理隔离资源 |
| Schemas | 20 项通过，含两模型两轮最低 15 次回测及不足额度拒绝 |
| API client | 9 项通过，含 `/complete` 空请求与响应身份校验 |
| Desktop 详情及模型 | 14 项通过 |
| Mobile 动作回执 | 3 项通过，含新接续请求与旧历史回执兼容 |

隔离数据库使用正式入口：`RUN_STRATEGY_CENTER_T06_POSTGRES=1 node scripts/test-journal-review-postgres.mjs test/strategy-optimization/strategy-center-t06-postgres.integration.test.ts`。新增用例覆盖四个有效候选全部测试、无效候选排除、空提前选择、统一揭示、重复接续不增加 Run，以及未锁定等待实验的恢复。原有取消、并发 attempt、部分失败、冻结结果缺失与历史锁定用例继续通过。

首轮验证发现测试仍访问已提取的私有方法，以及预算样本仍使用旧的 13 次上限；分别修正测试定位与预期，没有放宽生产门禁。

API client 及依赖构建、Desktop 构建、Mobile TypeScript、定向 ESLint、依赖边界与文件尺寸门禁通过。Mobile 未修改原生依赖或配置；本次不将 TypeScript 结果表述为原生设备验收。

本地日志：`/tmp/auto-experiment-{unit,postgres,regression,schema-tests,client-tests,desktop-tests,mobile-tests,packages,desktop-build,mobile-build,lint}.log`。日志与构建产物不加入版本控制。

## 浏览器与人工采纳边界

维护脚本：`apps/desktop/scripts/check-experiment-automatic-completion.cjs`。使用受控服务响应，在 1440、1024、768、390 四个宽度检查：

- 页面轮询从准备测试进入完成，展示四名候选的完整结果，没有批次选择控件，页面无横向溢出；窄屏表格在自身容器内滚动。
- 审阅后取消不提交；明确确认后的采纳请求包含候选身份及测试曝光确认，受控失败保留错误反馈。
- 技术中断的重试按实验身份发送空对象，复用锁定事实；正常运行期间没有测试推进写请求。
- 全部非读取请求受控拦截，真实业务写入为零。

结果：`/tmp/experiment-automatic-qa/results.json`；截图：同目录 `completed-{1440,1024,768,390}.png`。已人工查看桌面及 390 宽截图。首轮脚本引用了不存在的测试辅助函数，改用仓库既有策略 fixture 后四宽通过，未改变业务数据或生产组件。

## 正式更新记录

`sync-code.sh thesis-ledger` 正确拒绝当前 workspace 与运行态结构不一致。目标数据库为 `thesis_ledger`，owner 为 `thesis_ledger`，原 head 为 `20261107010000_risk_notification_providers`。新增 `20261112010000_autonomous_model_arena` 仅包含四张表及索引，没有删除或改写旧行的语句。

使用现有保留数据入口：`DEV_DATABASE_MODE=upgrade DEV_DATABASE_CONFIRM=thesis-ledger-dev/thesis_ledger ./scripts/update.sh thesis-ledger`。该前提只完成当前代码运行所需结构同步，不创建比赛、不启用来源，不作为竞技场产品验收。

首次正式构建在 Server 编译阶段失败：竞技场 HTTP 集成测试直接导入 API client 的相对 `dist`，干净镜像的 Server 依赖图未包含该包，出现 TS2307 及派生类型错误。脚本的缓存重试复现同一错误；尚未进入数据库升级，原 Server／Worker 保持健康。

修复为 Server 显式声明 API client 开发依赖，测试使用包入口；仅增加对应 lockfile importer，不增加生产依赖，不跳过测试编译。后续完整更新和独立运行态核验已通过，原失败保留为上述历史记录。

`pnpm --filter @thesis-ledger/server... install --offline --frozen-lockfile` 经安装器内置重试后通过 1501 项锁文件供应链核验；本地五包 `server... build` 通过，顺序包含 API client。`check-workspace-dependencies.mjs` 与 `check-boundaries.mjs` 通过。随后使用相同正式更新命令复用缓存，日志为 `/tmp/auto-experiment-update-retry.log`。

更新前只读核对：现有实验 `61185924-2aa1-4c72-a94e-f711c200752e` 处于 `awaiting_finalization`，未锁定候选，没有提前选择或技术失败原因。候选 1 为 `valid`，候选 2 为 `invalid`；已有开发／验证 Run 均保留。其回测上限为 30，读取 HTTP 返回 200。后续以此实验验证服务启动后自动接续，不创建新的真实实验或请求模型。

## 正式运行态结果

正式更新退出码为 0。保护目录为 `thesis-ledger-infra/.database-upgrades/run.7ygq09`，备份、输入、演练报告、事务 SQL 和执行记录均保留，权限为仅属主读写。备份大小 11,439,558 字节，SHA256 为 `d4f31f572fa4da6132b60322244f4282432ab52ed5603d2733d2d279d642f2ea`。备份内容不加入版本控制。

`rehearsal.json` 在 `2026-11-12T04:54:59.924Z` 确认恢复源 head、目标 head、完整结构、应用角色权限和旧数据保留全部通过；`execute.log` 为“事务执行成功。”目标库实际 head 已为 `20261112010000_autonomous_model_arena`。Server／Worker 均健康，启动窗口没有缺表错误；DSA、Redis、PostgreSQL 及其他项目服务保留。

Server／Worker 使用同一镜像 `sha256:f1a575d5d817f9577162fbb97bc7aba7972b43d4f4d25be5aaee3a08e94bbdd3`。宿主与两个容器逐项核对一致：

| 编译产物 | SHA256 |
| --- | --- |
| 主实验服务 | `ebd320fc3a7ec0ed51dbacce2aa1d905fb3f042cd15243ac27dc54e662718dd9` |
| 封存编排 | `33d8ea6e7358b9abe4dd9194af7227a01fb4d52cc6159eb444f8f5ef4c379d13` |
| Schemas 实验预算合同 | `c309a0cdf57c407f0d0dc37d19a5f3296c2f61a802aaed68254bfba3b60b4713` |

上述现有实验在服务启动后自动接续，于 `2026-11-12T04:55:14.398Z` 达到 `succeeded / completed`，统一揭示结果。候选 1 为 `test_valid`，新增测试 Run `494f159d-30c0-4354-8c0b-e41dfa603088`；候选 2 保留 `invalid`，没有测试 Run。开发／验证 Run 引用保持更新前原值。提前选择为 `null`，所有候选的正式采纳引用均为 `null`。

AI 调用数保持 2，回测次数从 6 增至 8，仅新增封存基线与有效候选测试。原失败实验保持终态，未重试、重命名或改写。实际 HTTP 200，实验读取资格为 `READABLE`，有效候选含测试指标，无效候选没有虚构测试值。这里的测试有效仅代表通过现有执行与样本门槛，不表示收益优于基线或建议采纳。

实际页面只读复核通过：1440 宽显示已完成、一个“审阅并采纳”入口，没有测试选择控件和技术重试提示，无页面错误、无横向页面溢出、没有业务写入。已人工查看截图 `/tmp/experiment-automatic-qa/runtime-1440.png`；结果为同目录 `runtime-results.json`。此次没有点击真实采纳。

## 最终一致性审查

当前规格、策略中心总合同、多源回测合同及使用指南已同步；被替代选择规格与其已完成证据保留历史锁定语义并归档。当前 Desktop／Mobile 源码未残留旧批次选择文案。相关变更的 `git diff --check`、相对文档链接、workspace 依赖及 import 边界检查通过。任务范围全部验收完成，未提交或推送，未扩大真实模型、来源或竞技场产品验收结论。
