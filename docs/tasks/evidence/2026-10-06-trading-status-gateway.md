# 停复牌网关与配置消费本地验收

> 日期：2026-10-06（Asia/Shanghai）。对应 [Spec](../../specs/2026-10-06-historical-rules-primary-backup.md) AC4 读取路径、AC5 配置与 [Task](../../archive/tasks/2026-10-06-historical-rules-primary-backup.md) P5.2a/P5.2b。
> 结论：P5.2 声明的本地正式网关、精确路由及配置消费通过。目标服务尚未同步，新能力的 Snapshot/执行与真实 Web 验收继续由 P5.3/P5.4 承担。

## 数据入口与职责

新增内置来源 `official-states / cn-stock-daily-suspension`，能力 `HISTORICAL_TRADING_STATUS`。复用 P5.1 的真实公告生产包、内容版本及已知/未知语义；原数据包未修改。目录按实际文件是否存在报告 ready，来源无需供应商凭据或人工准入记录。

正式代码入口为 `POST /api/v3/thesis-ledger/market/trading-status`，沿用现有 Data Token；Control Token 不能替代 Data Token。只读取当前生效配置中精确 pin 的 provider/upstream/routeIndex，不直接读取未配置目标，也不在 Provider 或 HTTP 中切换其他来源。读取期间策略修订改变时，拒绝晚到的旧结果。

本地收费/状态的精确匹配、就绪与读取职责提取到 DSA `src/services/thesis_ledger_local_rules.py`。该模块没有反向依赖 runtime；调用方注入网关错误构造器。原 runtime 继续拥有策略、预算、执行边界与修订检查，从 2,401 行降至 2,396 行。

HTTP 共同边界由 `api/thesis_ledger_local_rules.py` 承接，原 `build_public_fee_router` 工厂保留，收费 wire、错误码及认证行为回归通过。主 API 文件行数没有增长，旧收费模块从完整网关收敛为 12 行入口。没有创建平行路由、放宽其他价格/事件来源资格或增加共享杂项模块。

## 正式生产包 HTTP 与控制测试

使用实际 FastAPI router、Control Store、Provider runtime 和真实生产文件，经 TestClient 完成认证 HTTP，存储仅为 pytest 临时 SQLite：

- 目录显示内置来源和精确能力 ready；保存策略后目标 eligible，不要求 RouteAdmission 行。
- 返回原公告的停牌、复牌及 unknown，版本与 P5.1 共享 wire 对账；单日 08-17 不包含未来复牌日期。
- 未配置/停用时不调用来源；缺少 Data Token 或使用 Control Token 返回 401。
- 错误 pin、标的、区间和能力返回明确错误，不改写请求或替换来源。
- 文件缺失时目录不报告 ready，实际读取返回 upstream_failure，不读取另一规则包。
- 读取期间停用新修订时返回 not_admitted，不将旧响应作为当前配置结果返回。

这是本地真实组件联通与生产数据输入，未调用运行中的目标服务，不能代替目标 HTTP、部署或实际回测验收。

## 配置消费

Desktop 只修改现有 capability 标签和历史分组投影。实际目录能力显示“历史停复牌”，进入“历史规则与状态”，现有主备 Select、来源中文映射、去重和保存行为保持原实现。

定向渲染验证 ready、没有对应目录项、完整目录下来源未就绪，以及 partial 目录下已存配置。未就绪来源不成为可选候选，已存目标仍可查看并清除；partial 目录保留回显并禁用编辑。没有将“目录完整但某来源未就绪”误实现为整行无法清除配置。

沿用现有 shadcn Field/Select，无新组件、页面、样式或网络请求。这里只通过配置组件消费和构建，真实页面显示及保存读取留在 P5.4。

## 验证结果

| 输入与命令 | 结果及边界 |
| --- | --- |
| DSA 状态/收费来源与网关五文件定向 pytest | 51 项通过；覆盖真实包、主备收费兼容和新状态精确读取 |
| DSA current data route、Provider runtime、Control、Market V3、admission 五文件 | 85 项通过；首次仅旧注册表集合缺新真实来源，补入 official-states 后回归通过 |
| `PATH=.venv/bin:$PATH bash scripts/ci_gate.sh all` | 退出 0，7,897 项及 626 子测试通过，1 skipped、4 deselected |
| Desktop 配置/Provider/收费/预设四文件定向 | 22 项通过；补充未就绪断言的状态定向 2 项再次通过 |
| `pnpm --filter @thesis-ledger/desktop test --reporter=dot` | 最终 105 文件、691 项通过 |
| Desktop typecheck/build | 通过；最后仅测试断言调整，typecheck 与包级再次通过，构建输入源码未变化 |
| 局部门禁 | Python flake8、TS ESLint/Prettier、主仓 import boundaries、workspace dependencies、两仓 diff 检查及本地文档链接通过 |

P5.1 的 Schema 和生产包未修改，复用其来源证据；未更改 Server 消费、基准费用、数据库结构、依赖、Dockerfile 或原生配置，不重复执行与本叶无关的高成本门禁。

## 一致性审查与剩余范围

已核对来源身份、manifest、精确适配登记、文件就绪、Data Token、target pin、错误透传、晚到修订、原收费回归、中文分组和未就绪消费，声明的两叶本地范围通过。没有通过删除错误断言来放宽业务；注册表新增值反映真实库存，配置未就绪测试遵循原有可清除行为。

P5.3 仍需 DsaClient 状态读取、独立冻结、已知停牌执行及结果披露；P5.4 仍需必要上市/日历事实、正式目标同步、真实回测、离线重放和 Web 验收。P5 父任务保持未完成，整项 Task 保持 active。未操作目标路由、Docker、真实数据库、队列或浏览器，未 stage、commit、push；原有及并行工作全部保留。
