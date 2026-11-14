# 自主比赛可选总预算验收

对应[自主竞技场规格](../specs/2026-11-12-autonomous-model-arena.md) AC14，基线为当前未提交工作区。新建自主比赛的每模型／全场请求、令牌和费用总额度分别默认留空；旧日频及既有明确数值不改写。

## 契约与执行

空预算维度规范化为 `null`，显示“不限额”；明确的 `0` 仍表示零额度。自主预算输入可缺省，但持久化剩余额度的三个字段必须存在，避免把资料缺失当作无限额度。没有数据库列、迁移、占位大数或 `Infinity`。

领域预算计算只对有限维度进行原子预留及结算差额退款，无限维度保持空值。模型与全场仍在同一事务内锁定；每次模型与工具请求的预留、实际耗用、费用、未知结果和时间继续记录。未知结果、身份、定价和单次输入输出、研究时限／步骤保护不放宽。

Desktop 的创建、设置和账户及 Mobile 的创建、详情和账户复用相同语义。输入框留空，已设置的数值原样提交；费用按百万分之一币种保存，展示保留六位小数精度。

## 定向检查

| 范围 | 命令与结果 |
| --- | --- |
| schemas | `pnpm --filter @thesis-ledger/schemas test test/arena-live.test.ts test/model-arena.test.ts`：7 项通过，包含可选预算、零／非法值、缺失剩余额度拒绝与旧协议。 |
| domain | `pnpm --filter @thesis-ledger/domain test test/arena-live-budget.test.ts`：4 项通过，覆盖不限额、混合额度、已知退款、未知耗用和显示。 |
| api-client | `pnpm --filter @thesis-ledger/api-client test test/arena-live-optional-budgets.test.ts test/arena-live-optional-dates.test.ts test/arena-setup.test.ts`：12 项通过，含新旧默认、空白、零、费用精度及原单次限制。 |
| Desktop | `pnpm --filter @thesis-ledger/desktop test test/arena-detail-refresh.ui.test.tsx test/arena-daily-navigation.test.ts test/arena-catalog-navigation.test.ts`：17 项通过，原刷新及导航契约保持。 |

Server／Desktop／Mobile 类型检查、schemas／domain／api-client 构建通过。Desktop 生产构建通过，最终 Vite 用时 3.20 秒。定向 ESLint、`node scripts/check-boundaries.mjs` 及 `git diff --check` 通过。已有 React `act`、Node localStorage 及大包提示保留。

## 隔离数据库与 HTTP

执行正式隔离入口：

`node scripts/test-ai-provider-postgres.mjs test/model-arena/live-unlimited-budget-postgres.integration.test.ts test/model-arena/live-research-postgres.integration.test.ts test/model-arena/live-http-postgres.integration.test.ts`

专属临时 PostgreSQL 使用实际 51 个迁移，最终 3 个文件、11 项通过；脚本清理临时容器。覆盖：

- 不限额的多次预留和实际结算，模型及工具审计仍逐笔存在；重复结算不重复退款。
- 两模型争用有限全场请求额度只成功一笔，失败事务不改变模型预算。
- 全场不限额时仍拒绝模型零额度；混合费用额度按实际用量扣减。
- 未知结果保留有限维度预留，阻止补发并进入需要处理状态。
- 受控 SDK 多步研究、工具调用、公开决策及新预约完成，不因不限额而耗尽。
- 实际 Nest HTTP 经共享客户端创建及读取空日期、空预算比赛，剩余额度正确返回；启动、暂停、恢复及运行中直接结束、归属隔离继续通过。

SDK、工具和行情依赖均受控，不涉及真实模型或外部来源。

## 两端实际组件

- `ARENA_OPTIONAL_BUDGETS=1 arena-optional-dates-browser.mjs`：1440／1024／768／390 通过。六个总额度默认空白及“不限额”占位、全部不限额、混合有限维度、明确零、设置及账户回显、日期可选和直接手动结束均验证。每宽 5 次写入全部由受控响应接管；真实业务请求为零。截图 `/tmp/arena-optional-budgets-qa/`。
- `ARENA_MOBILE_OPEN_SEASON=1 ARENA_MOBILE_UNLIMITED_BUDGET=1 arena-live-mobile-browser.mjs`：四宽度通过实际 Mobile 组件、图表触摸、图例、净值、成交资料、无总额度账户及手动结束；新建六项默认空白，单次输入／输出仍为 16000／1500。截图 `/tmp/arena-unlimited-mobile-qa/`。这是 React Native Web 的受控证据，原生宿主门禁保持独立。临时 Vite 已关闭。

人工检查 390 的新建预算区和账户截图；示例草稿账户使用初始模拟资金，无虚构研究或成交。

## 正式快更与只读核验

从 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行 `./scripts/sync-code.sh thesis-ledger`，预检、Server/workspace 构建、传输、重启和健康检查通过，退出码 0。最终审查补齐剩余额度严格校验后，重验受影响检查并再次通过同一正式入口同步。两服务镜像均保持 `sha256:8066e62ea225285e281698676d3dfad77a481fa253e24fc235e8e1aa9360764f` 且为 healthy。快更位于可写层，不代表镜像发布，容器重建后会恢复镜像内代码。

容器只读探测确认：缺省预算为三个 `null`，缺失剩余额度被拒绝，预留后不限额仍为 `null`，明确零额度仍阻止预留。目标目录一次只读 GET 返回 200，5 场旧记录通过现行契约。关键产物的容器与宿主 SHA-256 相同：

| 产物 | SHA-256 |
| --- | --- |
| schemas `arena-live-budget.js` | `1f6a804480be83ebe2f85dede464912a1336843a3138605cca0ca71d6030afab` |
| domain `arena-live-budget.js` | `fcda0ec6d26f4c5837e7f8e049bd9aca48847425765b28f18ce45d3b6a3a8e98` |
| Server `live-storage.js` | `d5db5e386e346539c35ac0bbafd8352f6a77a8c31bc810a19b7a49c9b7bf6c99` |
| Server `live-research-budget.js` | `f1a5658ca3704a37457e1ae62f27777ad366c242869245aba54a5fc0414768f3` |

没有修改真实比赛、启动真实研究或调用外部来源。

## 失败修正与最终审查

首次 domain 构建遇到并行回测源码的类型错误，随后观察到该文件已有修正，复验及最终正式构建通过；本任务没有修改该文件。首次数据库断言错误地比较 JSON 字符串顺序，改为结构比较后通过，全部金额及审计断言保留。浏览器计数最初包含隐藏页签，改为限定当前账户面板后通过。新增测试的未使用参数 lint 已修正。

最终审查确认预算输入可选与持久化状态完整性分别约束，B01–B04 完成。旧数字不转为不限额，原单次保护、业务数据、未知耗用与父级真实来源／原生门禁保持边界。工作区未提交，保留其他任务的修改。
