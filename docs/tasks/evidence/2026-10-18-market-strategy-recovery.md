# 市场配置、策略实验与风险应用的异常恢复验收

本记录承接[全站 UI Task](../2026-09-08-ui-interaction-consistency.md)的 T5.R2、T2.R9、T3.R1，范围为 Desktop 客户端异常、提交保护及写入确认后的读取恢复。使用最终生产构建的宿主 `5174` 预览连接 Docker API；不代表 Electron 安装包或原生客户端验收。

## 执行边界与样本

- 全部凭证配置、权限检查、实验准备/创建/详情操作、风险预览/保存请求均由 IAB CDP 截留并返回受控结果。没有实际保存假凭证、创建 AI 实验、运行封存回测、采纳版本、创建/启用规则或发送通知。
- 新建实验沿用当前模型清单，只验证客户端提交链。AI 真实生成及既有调用账本继续停止；路由故障切换暂缓，没有修改真实路由、启停来源或增加准入权限。
- 实验与候选、风险账户和空规则预览使用 `apps/desktop/test/fixtures/experiment-risk-ui-recovery.json`，浏览器与挂载回归复用同一小份样本。它们不证明真实候选质量、规则正向消费或实际账户可用；这些义务仍由现行业务任务及既有[运行态记录](2026-10-17-ui-runtime-closeout.md)承接。
- 原始本地回执位于 `.recovery-artifacts/market-experiment-ui-2026-10-18/`。`controlled-request-receipts.json` 保存 94 条应答及部分只读恢复记录，其中 29 个受控非 GET 请求；这是受控回执，不是全量网络日志，也不是 29 类业务。

## 已完成的检查与修复

| 入口 | 检查结果 | 实现及证据 |
| --- | --- | --- |
| 市场凭证保存/移除 | Tushare 的固定假值在 503 后保留，提交中不能关闭。受控保存确认后清除输入；自动权限检查 503 与状态 GET 503 分别展示。重新读取仅 GET，不重测权限、不再次提交配置。移除也覆盖 503、重试确认及后续读取失败。 | `ProviderCredentialsSheet` 订阅已有 registry 查询，提供持久恢复入口，保留写入确认状态；补齐重复移除保护。`credentials-saved-read-failed.png`；挂载回归使用实际 TanStack mutation/query，另保留原八项凭证状态测试。 |
| 本地公告与精确能力检查 | 本地包是只读资料入口，公告列表首次 503 后重试恢复；刷新失败保留旧结果时明确陈旧。精确检查 POST 503 后重试，受控返回不可用时显示“来源读取检查未通过”，没有把 HTTP 恢复或目录 ready 当作真实能力通过。未访问外部原文页面。 | `OfficialAnnouncements` 区分首次失败与缓存陈旧；`ProviderExactChecksSheet` 使用 `SheetBody` 滚动区及 `SelectGroup`。真实公告列表只读恢复，精确检查没有到达上游。 |
| 实验新建与准备 | 实验模型/参数配置、三步表单保留；准备 503 可直接显示并重试，不再因孤立 `FieldError` 崩溃。创建 503 后沿用原提交意图，提交中页面离开被阻止。创建确认后详情与对比 GET 失败，仍保留明确实验名称及无需重复创建提示；GET 重读恢复。 | `OptimizationPricePreparation` 错误放入 `Field`；`StrategyExperimentCreatePage` 先缓存创建响应，保护提交中离开并增加确认反馈。另修复基线版本触发器显示内部 UUID，复用选项的策略名称与版本标签。`experiment-preparation-failed.png`、`experiment-created-read-failed.png`、`intent-checks.json`。 |
| 实验封存、克隆、取消、采纳 | 四类操作分别覆盖错误及重试确认后 GET 失败，恢复只读。详情保持已确认结果，陈旧时禁用写入。封存请求确认不再直接声称测试已完成；完成和揭示由服务端状态决定。克隆保留“查看克隆实验”入口。采纳上下文 GET 503 可重读；409 保留审阅，提交中返回候选无效，重试沿用采纳意图，确认后保留正式版本链接。 | `StrategyExperimentDetailPage` 保留操作回执与结果，不再因对比/详情读取失败丢弃整个页面；新操作仅关闭同操作的旧失败通知。`experiment-finalization-read-failed.png`、`experiment-clone-read-failed.png`、`experiment-cancel-read-failed.png`、`experiment-adoption-read-failed.png`。封存阶段、完成阶段和候选采纳是独立受控分支，不是实际实验历史。 |
| 风险应用预览与保存为停用 | 账户读取 503 显示失败而非“没有账户”，恢复不以空 accountId 读取全部应用。预览 503 保留账户、范围和通知选择；脏稿关闭须确认，预览/保存中关闭无效。保存 503 后沿用同一意图；确认后应用 GET 503 时保留已保存结果及重读入口，禁止再次提交；恢复只读。 | `StrategyRiskApplicationPage` 保护关闭与页面离开，先缓存保存响应，读取失败时留在当前页。字段可编辑性使用 mutation 状态，关闭即时保护使用操作引用；两者分别验证，避免 ref 变化未触发显示更新。通知高级字段也在提交与保存确认后锁定，重试关闭本操作旧错误。`risk-final-saved-read-failed.png`；最终构建实际核对冷却时间输入的 `disabled=true`。 |

`intent-checks.json` 中创建、采纳、风险保存的失败重试意图均保持一致。所有风险保存样本均停用且关闭通知；空预览只证明客户端错误与恢复链，不增加真实风险消费通过项。

## 验证结果

- 新增八项挂载回归覆盖凭证恢复、实验创建、账户错误、风险保存及实验四类详情写入；使用实际 TanStack hooks 和路由，替换 API 边界。实验创建的准备子组件在该项测试中隔离，真实准备界面的 503/重试另由浏览器验证。原 style 契约计数同步增加克隆结果链接。
- Desktop **149 文件、892 项通过**，类型检查及生产构建通过。10 个变动源码/测试文件 ESLint、架构边界、静态 accessibility 13 项及文件尺寸 ratchet 通过；原九项超限债务未增长。日志为 `desktop-tests.log`、`desktop-build.log`、`eslint.log`、`boundaries.log`、`accessibility.log`、`size.log`。
- 四类浮层为风险已保存/读取失败、凭证、本地资料和精确检查。浅深主题 × `1440×900`、`1024×768`、`390×844` 共 **24 组**，对话框均存在，整页无横向溢出，检查的页脚/末尾操作均在视口内。`overlay-layouts.json` 与八张窄屏 PNG 保留。该矩阵不代替全部错误长度、下拉展开、所有实验结果布局或全站可访问性验收。
- 临时主题已恢复深色，视口与请求截留清除，自建浏览器页签关闭；宿主预览服务已停止。

## 运行态与保护结果

在 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行 `./scripts/sync-code.sh thesis-ledger`，退出 0。兼容性预检通过，Server/Worker 使用当前代码，镜像 ID 未变，没有数据库结构或外部卷变更。见 `target-sync.log`；这是容器可写层更新，不是镜像发布。独立核对主 API `/api/v1/health`、DSA `/health` 均为 200。

`verify-original-state.mjs` 确认原七表及 54 份成功 V3 结果一致，回测仍 71 个、活动 0；`disabled-conversion.mjs verify` 确认原 Provider/default、AiRun/AiInvocation 未变。真实路由仍为期望/生效修订 154、`applied`；Tushare 仍是 configVersion 0、未配置、未启用。没有将受控凭证或风险账户保存到环境。

开始时主仓 `main@da002744` 有 331 项修改、infra `main@3f661df` 有 23 项、DSA `yzin@dd265715` 有 37 项，暂存区均空。本轮分块捕获 459 个既有修改及相关源码输入的哈希，避免大输出截断；仅定点修改所属 Desktop 文件、测试、UI Task/索引及本记录，保留其余输入。三仓 HEAD 与空暂存区保持，未提交、推送或创建 PR。

## 当前结论

T5.R2、T2.R9、T3.R1 的客户端受控异常与写入恢复完成。T1–T6/T8 仍按原全量入口及状态矩阵保留，不因本轮样本批量关闭；真实 AI、通知发送、Provider 资格、基金 NAV 及路由故障切换继续由各自现行任务承接。本轮没有新增 TODO 或归档当前验收义务。
