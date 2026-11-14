# 竞技场 Desktop 界面重设计验收

规格：[界面合同](../specs/2026-11-12-arena-desktop-experience.md)。实施：[归档任务](../archive/tasks/2026-11-12-arena-desktop-experience.md)。本记录同时支持活动的[自主竞技场父任务](../tasks/2026-11-12-autonomous-model-arena.md)，因此保留在当前证据目录。

## 实现范围

- 日频详情以比赛名称、状态、市场和赛期为核心，收益表现／模型账户／轮次记录／比赛设置分区。没有净值记录时仅解释一次，并提供账户与轮次入口；部分可比较时保留逐行缺失。现金明确标注现金，完整零额度、费项和协议在对应区域可查。
- 日频轮次按模型分组，决策、模拟成交与调用执行分别展示，保留失效条件、冻结引用、未匹配引用、费用、请求编号和快照。模型深链可筛选单个模型，也可恢复全部模型。
- 自主比赛默认收益主图，点击模型进入账户并移动可见焦点；切回收益时保留指标、时间范围和图例状态。模型账户保留研究预约、持仓、委托、成交与来源资料。长模型标识限制在容器内。
- 创建页按比赛信息、市场范围、参赛模型、交易规则、调用预算和观察设置分组；使用共享日期、DecimalInput、ToggleGroup、Switch 及 Collapsible。预算保持可见，保存入口与摘要组合。保存和真实启动仍分开。
- 列表保留创建时间倒序、新建与搜索同排、类型／市场／状态筛选、分页和返回条件。没有新增排序控件、业务接口、依赖、数据库改动或行情读取。

## 本地检查

执行目录为主仓，命令通过 `rtk proxy` 执行。

| 检查 | 命令／输入 | 结果 |
| --- | --- | --- |
| 原刷新与目录导航 | `pnpm --filter @thesis-ledger/desktop test test/arena-detail-refresh.ui.test.tsx test/arena-catalog-navigation.test.ts` | 13／13；两种响应顺序保留原内容，最后一个相关请求结束才收起一个结果区加载圈。 |
| 类型与生产前端构建 | `pnpm --filter @thesis-ledger/desktop build` | 通过；包含 `tsc --noEmit` 与 Vite；最终构建 4.74 秒。 |
| 定向静态检查 | `pnpm exec eslint apps/desktop/src/features/model-arena/Arena*.tsx apps/desktop/test/arena-detail-refresh.ui.test.tsx` | 通过；运行脚本不属于当前 ESLint 作用域，其语法由实际 Node 执行覆盖。 |
| 差异卫生 | `git diff --check -- apps/desktop/src/features/model-arena` | 通过；不提交或重置共享工作区。 |

## 受控浏览器

使用 `apps/desktop/test/browser-arena-live.html` 挂载实际组件，Playwright 使用本地 msedge。四档宽度均为 1440／1024／768／390，高度 960；所有浏览器接口由受控响应接管。

运行环境为 `PLAYWRIGHT_MODULE=/tmp/codex-market-range-qa/node_modules/playwright`，开发入口通过 `pnpm --filter @thesis-ledger/desktop exec vite --config test/ratio-display.vite.config.mjs --port 5187` 启动。各脚本通过 `ARENA_QA_OUTPUT` 或 `ARENA_LIST_QA_OUTPUT` 指定下列截图目录。

| 脚本 | 覆盖与结果 | 截图目录 |
| --- | --- | --- |
| `scripts/local-runtime/arena-live-list-browser.mjs` | 四宽筛选、分页、搜索提交、时间顺序、新建同行、历史轮次返回、空状态、刷新失败保留数据和下拉边界通过；真实写入 0。 | `/tmp/arena-redesign-list-qa/` |
| `scripts/local-runtime/arena-live-browser.mjs` | 四宽曲线、图例、净值、周期、模型账户联动与焦点、切回保留图表状态、持仓／成交／来源、创建返回和 Switch 点击／空格通过；另核对桌面暗色曲线。 | `/tmp/arena-redesign-qa/` |
| `scripts/local-runtime/arena-experience-browser.mjs` | 四宽部分净值、全缺失、引用展开、模拟成交、审计、模型深链、日期弹层及取消、保存失败原值保留与同参数重试通过；启动、失败暂停、暂停、恢复、封存通过。每宽 8 次受控写入，真实写入 0。 | `/tmp/arena-redesign-experience-qa/` |

精度样本实际提交：本金 `999999999999.123456`、最低交易费 `0.000001`、每模型费用 `0.000001`、全场费用 `0.000002`。费用额度分别传为 1／2 微单位；显示和聚焦／失焦没有改变本金与最低费原值。保存失败后两次请求体完全一致。

## 真实本地只读页面

`scripts/local-runtime/arena-detail-runtime-browser.mjs` 只允许已确认的 `http://127.0.0.1:3000` 本地目标和有界 GET。它读取当前已结束的“招商银行 · 历史成交回放（复用11月6日决策）”及已有轮次，验证模型长名称、现金、收益缺失、页签和返回。读取比较接口仅消费本地冻结数据与数据库计算，不请求 Provider。

- 真实接口加实际组件：`ARENA_RUNTIME_QA_OUTPUT=/tmp/arena-redesign-runtime-qa`，四宽全部通过，1 次目录与每宽 4 次比赛／比较／轮次读取，共 17 次本地 GET。
- 当前完整开发应用：增加 `ARENA_QA_ORIGIN=http://127.0.0.1:5173 ARENA_RUNTIME_FULL_SHELL=1 ARENA_RUNTIME_QA_OUTPUT=/tmp/arena-redesign-shell-qa`，四宽全部通过，共 25 次本地 GET。每宽外壳账户列表单独使用一次空样本，防止无关账户／估值读取；其余竞技场结果来自真实本地接口。它证明当前浏览器外壳能消费新布局，不证明 Electron／Mobile 原生或真实自主比赛。
- 两组均无页面横向溢出、页面脚本异常、未登记接口、真实业务写入、外部来源和模型调用。人工查看了完整应用 1440／390、真实轮次及受控收益／创建截图；平板宽度由脚本检查边界与导航。

前端开发服务直接消费当前源码，生产前端产物已构建。此轮没有修改 Server／Worker，也没有执行 Docker 更新；不把前端构建解释成目标镜像或原生客户端已更新。

## 失败与复核边界

首次定位使用了过宽的“网页搜索”文本匹配，命中了摘要中的同名项；限定到开关所属区域后通过。原首次加载测试误取页头刷新按钮内的状态圈，改为精确检查结果区的“正在读取比赛”，保留原等待与单圈合同。

首次真实只读脚本返回详情后立即关闭页面，尚有比较读取在途，触发 `Request context disposed`；补上等待相关读取全部结束后重验通过。该失败不作为通过证据，不包含业务写入；上面 17／25 次是各自完整通过运行的计数，不包含首次失败运行。

暗色截图复核发现只切换 `dark` class 没有切换项目主题 token，初次图片仍是浅色；脚本改为同时切换项目的 `data-theme`、class 与 `colorScheme`，并断言实际背景色后重新截图，不将初次图片当作暗色通过证据。

本任务只验收 Desktop 界面范围。父级实时执行规则、ETF／三市场真实来源、原生宿主、自主真实运行及部署恢复仍按原任务持有，未借界面验收解除门禁，也未改写既有真实资料失败事实。

## 后续校正：内容分组与账户归属

根据用户后续确认，当前界面采用标题、留白、对齐及轻量底色组织内容；账户资料由“模型账户”页签统一承载，收益页聚焦收益比较、缺失说明和已有记录入口。该规则已写入 `/Users/yzin/.agents/AGENTS.md` 的“界面内容分组”，并同步到现行规格 U02／U06。

逐项核对日频详情全部页签、自主详情与图表、轮次、首页空状态和创建页。普通内容区、设置、账户、折叠区和空状态按同一分组方式呈现；输入、按钮、表格及图表坐标保留其交互与数据语义。全局共享 Button／Table 样式未修改。

本次代码变化后重新验证：

- 原刷新及目录导航 13 项通过；测试仍有既有 React `act` 警告。首次详情的断言核对初始本金和加载等待，账户数据在对应页签消费。
- Desktop typecheck、定向 ESLint 通过；Desktop build 退出 0，Vite 3.13 秒。构建保留宿主 localStorage 实验性提示及原有 chunk 体积提示，不作为零警告结论。
- `arena-experience-browser.mjs` 和 `arena-live-browser.mjs` 四宽度全部通过；新增核对收益页账户信息归属、账户页一次显示、设置展开，以及可见内容分组的实际计算边框。保留原深链、精度、保存失败重试、图表、标的选择和状态操作验证。样本写入全部被浏览器接管，真实写入为零。
- `arena-detail-runtime-browser.mjs` 在当前完整开发应用四宽度通过，真实竞技场只读 GET 共 25 次，外壳账户列表各用一次空样本。没有模型、行情或业务写入。新增设置展开截图，并检查实际分组边界；人工查看 1440 收益／设置与 390 创建截图。

本轮截图目录分别为 `/tmp/arena-content-grouping-qa/`、`/tmp/arena-content-grouping-live-qa/`、`/tmp/arena-content-grouping-runtime-qa/`。既有截图仅保留历史实施证据，当前展示以本轮为准。

## 折叠入口悬停反馈

竞技场共用的 `ArenaDisclosure` 采用至少 40 像素高的整行点击区，上下和左右各留 8 像素内边距，文字仍与正文对齐；长标题可换行，箭头随展开状态旋转。沿用共享 Button 的悬停、键盘焦点与展开反馈。

定向 ESLint、Desktop typecheck 通过。完整开发应用在 1440／1024／768／390 下完成真实本地只读验收：悬停区高度、内边距和页面边界通过，点击展开、空格收起、回车展开通过；人工查看桌面及窄屏截图。脚本仍为 `arena-detail-runtime-browser.mjs`，25 次本地只读 GET，外壳账户列表为受控空样本，真实写入、来源及模型调用为零。截图为 `/tmp/arena-disclosure-hover-qa/*-settings-hover.png`。

## 模块横向分组

按用户提供的策略中心运行详情参考，独立模块之间使用单条轻量横向分隔线，线条与内容边缘对齐，两侧各留 24 像素纵向间距。竞技场展示层复用共享 `Separator`，由 `ArenaSections` 组合相邻的有效模块；日频设置、模型账户、轮次、自主收益及设置、研究记录和创建分组沿用同一表达。全局 AGENTS.md 与现行规格 U06 已同步这一准则。

本轮 13 项原刷新／目录导航测试、Desktop typecheck、定向 ESLint 和 Desktop build 通过；Vite 构建 3.15 秒。单元测试仍有既有 React `act` 提示，构建仍有宿主 localStorage 与 chunk 体积提示。

受控完整流程、自主图表／创建流程和真实本地详情均在 1440／1024／768／390 通过。真实设置页额外核对 3 条分隔线的厚度及左右边缘；原悬停、空格／回车展开与页面边界检查继续通过。人工查看了桌面设置及窄屏创建截图，图表高度及交易事实沿用原结果。真实详情仍为 25 次本地 GET、每宽一次受控外壳账户列表，真实业务写入、模型及来源调用均为零。

受控流程首次因共享工作区的模型选择器已调整为搜索多选，旧按钮定位超时；脚本同步为当前选择交互后四宽通过。该失败归属于验证入口过时，没有执行真实创建或模型调用。

本轮截图目录为 `/tmp/arena-section-dividers-qa/`、`/tmp/arena-section-dividers-live-qa/`、`/tmp/arena-section-dividers-runtime-qa/`，复用前述三个维护脚本及环境参数。当前开发服务直接消费新样式，没有执行 Docker 或原生发布。

## 操作链接的边框

实际受控页面复现：普通 outline Button 为 `1px solid rgb(230, 231, 234)`，同变体的“查看最近决策”链接却是 `1px solid rgba(0, 0, 0, 0)`。原因是 Button 内部会合并原子类冲突，直接消费 `buttonVariants` 的链接保留了基础 `border-transparent` 与变体 `border-border`，透明色最终覆盖描边。

共享样式出口现统一执行原子类冲突合并，Button 和链接都消费同一结果；变体、颜色 token、阴影及焦点反馈继续沿用现有规范。核对了 7 个消费文件，包含竞技场导航及操作链接、策略入口和日历按钮。外围内容分组沿用当前横线与留白合同。

Desktop typecheck、Button 定向 ESLint、13 项竞技场刷新／目录导航测试和 Desktop build 通过，Vite 3.09 秒。原 React `act`、宿主 localStorage 及 chunk 体积提示继续保留。四宽度目录、受控完整流程、自主收益／创建和真实日频详情均通过；新增断言直接核对实际边框宽度、样式及非透明颜色，自主收益另检查暗色边框。周期选中切换存在颜色过渡，脚本等待边框色离开透明状态后再核对最终样式，不把过渡首帧视为常态。

真实详情验收仍为 25 次本地 GET，外壳账户列表为受控空样本，无真实业务写入、模型或来源调用。人工查看真实账户页与受控暗色收益截图。当前截图目录：`/tmp/arena-button-border-list-qa/`、`/tmp/arena-button-border-flow-qa/`、`/tmp/arena-button-border-live-qa/`、`/tmp/arena-button-border-runtime-qa/`。本轮只更新前端源码与构建产物。
