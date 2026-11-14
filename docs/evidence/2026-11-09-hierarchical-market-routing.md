# 分级路由与本地资料实施证据

状态：本功能验收完成；执行结论见 [任务清单](../archive/tasks/2026-11-09-hierarchical-market-routing.md)。规格见 [分级路由与统一本地资料](../specs/2026-11-09-hierarchical-market-routing.md)。DSA 整库检查记录了下述 23 项并行来源改动相关失败，未声明整库全绿。

## 实现边界

Server Market 持有无损归纳、规则继承与精确编译；公共 Schema 和 API 客户端仅承载契约。分级元数据位于现有策略 JSON 的 `routingConfig`，当前策略与历史由同一事务保存。旧精确写入清除元数据，移除来源也清除仍引用该来源的规则元数据，避免上级继承复活旧来源。

DSA 新入口为 `local-materials / local-materials`；原五种本地身份仍注册。公共费用择取唯一完整包，共有费项矛盾或同等完整包冲突则拒绝。事件入口读取原公告身份的当前准入，投影为统一身份，保留原公告字节、金额及原准入记录。离散资料日期不扩展为连续覆盖。

## 已完成的验证

| 边界 | 方法与结论 |
|---|---|
| 规则编译 | Server 定向测试：逐级覆盖、明确空规则、子级保留、互补覆盖、凭据缺口、绑定歧义、无损导入、停用项不复活及创建同主备细分保留原绑定。最新 7 项通过。 |
| API 与存储 | Server 配置测试 4 项通过，验证读取和预览无写入、拒绝伪造保留绑定、修订冲突和预览令牌；资格恢复只报告待编译变化、不写入已存路由，并允许原规则直接预览。既有存储测试 6 项通过。 |
| 实际数据库 | `pnpm exec node scripts/test-market-routing-postgres.mjs`，使用仓库隔离 PostgreSQL harness，完整迁移、独立随机容器及清理；3 项通过。证明并发只成功一次、当前与历史同存、应用超时重试，以及历史写入失败回滚当前记录。未连接业务数据库。 |
| 客户端草稿 | `test/routing-config-workflow.test.tsx` 3 项通过：刷新不覆盖脏草稿、保持原提交修订、失败恢复、丢弃晚到预览、恢复继承。 |
| 客户端包级 | Desktop 完整 285 文件、1819 测试通过；Schema 133 文件、1497 测试通过；API 客户端 42 文件、219 测试通过。共享工作区快照包含其他任务修改；结论限该次输入，局部后续修复另行定向复验。 |
| Server Market 包级 | 102 文件、1111 测试通过，8 文件/35 测试因环境标志跳过；本次数据库场景已独立实际运行。 |
| DSA 本地执行 | 本地费用六个市场/类型组合使用实际 Runtime；停复牌三市场使用原解析器；公告现金使用原准入及原字节，原身份读取结果保持。14 个相关测试文件共 1066 项通过，包含来源库存、就绪、精确检查、旧身份及公司行动。 |
| 工程门禁 | 主仓边界通过，新增代码严格复杂度上限 20 检查通过；文件规模 ratchet 通过，存在 6 项既有大文件警告。DSA 能力边界、运行时打包契约、数据测试清单和关键 flake8 检查通过。 |

运行日志：`/tmp/hierarchical-routing-{desktop-tests,schema-tests,server-tests,dsa-focused,guardrails}.log`。测试与构建不替代以下运行态与浏览器验收。

## 共享工作区完整回归限制

DSA 首次完整离线库 `python -m pytest -m 'not network' -q --tb=short`：7615 通过、29 失败、1 跳过、5 排除，约 289 秒。新增本地入口导致的库存目标数量和原工厂断言分别更新并重验，原工厂用例继续验证旧身份，统一入口由独立实际 Runtime 用例承接。

剩余 23 个失败单独重现（`/tmp/hierarchical-routing-unrelated-failures.log`），涉及共享工作区 TickFlow 免费日线/启停默认值及新增账号权限检查；HiThink 测试假对象仅接受 `hithink`，实际新增检查传入 `tickflow` 而断言失败。本任务未改动上述来源行为，也未关闭用例或扩大通过结论。

最后一次 `pnpm guardrails:complexity` 在共享工作区新增质量测试中出现 5 项 ESLint 错误：`apps/server/test/quality/data-quality-observation.test.ts` 的 4 个未使用参数、`data-quality-postgres.integration.test.ts` 的类型 import。相关文件不属于本任务修改；本任务全部新增源码与实际修改的控制/存储代码独立严格 ESLint（复杂度上限 20）通过，边界和文件规模门禁通过。未宣称最新全仓 guardrails 命令成功，也未改动并行任务的测试。

## 运行态及浏览器

从 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行：

- `./scripts/sync-code.sh all`：首次遇到活动更新锁，锁释放后兼容性预检拒绝 DSA `requirements.txt` 不一致，未绕过预检。
- `./scripts/update.sh all`：退出 0，完整构建和启动，未执行业务配置保存或数据库重建；日志 `/tmp/hierarchical-routing-update.log`。
- `./scripts/sync-code.sh all`：退出 0，补齐构建期间最后的编译诊断和加载层修复，Server、Worker、DSA 健康。日志 `/tmp/hierarchical-routing-final-sync.log`。最后补齐位于容器可写层，镜像 ID 不变，容器重建后需重新同步这部分源码。

实际 GET 返回 29 个来源，统一“本地资料”含 14 个精确目录条目、13 个当前就绪，现金公告继续保持未准入。目录就绪不认证全部标的与日期覆盖。真实策略保持 revision 194、117 条精确路由；读取归纳为 58 条规则、152 项口径，其中 52 条细分例外。原样 POST 预览返回 117 条路由、0 项来源变更，未写入分级元数据或切换来源。

浏览器命令使用 `apps/desktop/scripts/check-hierarchical-routing.cjs`，`PLAYWRIGHT_MODULE=/tmp/codex-market-range-qa/node_modules/playwright`，`MARKET_ROUTE_CHROMIUM_EXECUTABLE=/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge`。访问实际 `http://localhost:5173/market-data`，GET 和 POST 预览使用真实服务；所有 PUT 保存拦截为 503/成功样本，其余非只读请求禁止透传。

| 宽度 | 页面宽度 | 右侧面板边界 | 保存与副作用 |
|---|---|---|---|
| 1440 | 1440 | 480–1440 | 先失败后成功，共 2 次受控保存；真实写入 0 |
| 1024 | 1024 | 64–1024 | 同上 |
| 768 | 768 | 16–768 | 同上 |
| 390 | 390 | 0–390，全屏 | 同上 |

四种宽度均验证默认全部市场、范围切换无修改、精确用途/周期/复权查看、单独配置展开、明确清空、恢复继承、完成收起、取消预览保留草稿、统一预览保留例外、503 后同一草稿重试、资料详情、数据源/路由页签原导航。每次预览示例显示 6 项来源变更，保留 52 条例外。页面无横向溢出、面板越界或浏览器错误；可见正文与选中值为正文色。桌面与窄屏截图已实际查看。

最终复核补齐 `pendingChanges`：已纳入范围的能力在资格恢复后，读取只报告待确认变化；即使规则未编辑也能主动预览、保存。新增能力仍须先纳入范围。390px 验收额外使用受控 `pendingChanges=1` 响应，证明没有草稿编辑时也可预览，查看范围不产生编辑。补充 Server 定向 17 项、隔离数据库 3 项、Desktop 草稿 3 项及构建/严格复杂度均通过。

最后从 infra 执行 `./scripts/sync-code.sh thesis-ledger`，另一项正式更新释放锁后退出 0；日志 `/tmp/hierarchical-routing-catalog-sync.log`。未改变依赖或数据库，仅补齐 Server/workspace 代码，属于容器可写层更新。实际 GET 返回 `pendingChanges: 0`、revision 194；原样预览 HTTP 201，117 条编译路由、0 项变更。上述四宽度脚本在最后同一运行态下再次全部通过，业务策略仍为 117 条，真实保存透传 0 次。

截图及结构化结果位于 `/tmp/hierarchical-routing-qa/{main,fine}-{1440,1024,768,390}.png`、`results.json`；日志 `/tmp/hierarchical-routing-browser.log`。验收结束再次读取真实策略，仍为 revision 194、117 条路由，未加入受控样本。

## 最终一致性复核

规格的继承、空规则、例外保留、目录冻结、无损归纳、主备资格与歧义、本地包适用范围、费用不重复、历史原身份、准入、原子历史、并发、失败恢复、客户端共享草稿、实际运行及四宽度交互均有对应实现和证据。旧 V3 线协议和数据库结构保持；更新来自维护入口。未提交、未推送，其他工作区修改保留。本功能范围通过；完整 DSA 离线库的并行来源失败保持原结论，不扩大验收范围。
