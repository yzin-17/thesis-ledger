# 诊断失败覆盖排查与运行态验收

对应 [Spec](../../specs/2026-11-09-diagnostics-failure-coverage.md) 与 [Task](../tasks/2026-11-09-diagnostics-failure-coverage.md)。核对日期：2026-11-09。

## 根因与真实记录

原诊断页只查询 `/notifications?status=failed` 和 `/data-quality/issues?status=open`。它没有读取 `ProviderHealthCheck` 或异常 `AutomationRun`；数据质量仅有显式写入接口，没有接入正常业务失败链路。因此原页面两个空表不能证明没有发生其他失败。

在 `thesis-ledger-dev-postgres-1` 的 `thesis_ledger` 数据库以 `thesis_ledger` 角色执行只读事务：通知已送达 2 条、失败或重试中 0 条；数据质量记录 0 条；自动化成功 2102 条、结果待确认 1 条。来源降级或不可用记录共 95 条带错误码，其中 `pending` 32 条、`operation_authorized` 23 条、`validation_cancelled` 1 条。排除过程及主动取消状态后，真实检查异常为 **39 条**。

入口：`docker exec thesis-ledger-dev-postgres-1 psql -U thesis_ledger -d thesis_ledger -X -c '<BEGIN READ ONLY; 聚合查询; COMMIT;>'`。来源最终条件为 `state IN ('degraded','down') AND (errorCode IS NULL OR errorCode NOT IN ('pending','operation_authorized','validation_cancelled'))`；自动化条件为 `status IN ('failed','unknown_outcome')`。最后一次核对结果为来源 39、自动化 1、通知 0。没有写入数据库。

自动化原错误说明 Worker 租约过期，无法确认外部副作用是否已经完成，不能改写为执行失败。这些数量仅代表已记录的检查和运行事实。

## 本地修复

Server 提供独立的 `/providers/health/issues` 与 `/automations/issues`，数据库过滤先于计数和分页，保留稳定时间与 ID 倒序及默认完整历史。诊断客户端严格校验异常状态，旧 Server 不支持或返回普通历史时显示读取失败。来源异常接口只投影公共摘要，避免适配器详情格式阻断整页。通知支持状态并集，诊断查询 `failed,retrying`，旧单状态行为保持。共享 Schema 保留顶层 `errorCode`。

Desktop 新增来源检查异常与自动化运行异常，独立分页，保留名称、状态、时间和错误。等待重试、结果待确认、慢响应降级分别表达。刷新保留原表与中央加载圈，首次失败、刷新失败与成功为空分别表达。未启用的诊断查询不参与其他页签的加载判定。数据质量说明明确空记录不等于数据健康。

提取只读表格与诊断面板职责；`ProviderSettings` 函数有效行数由基线 294 降至 289，聚合表格文件缩小，未提高阈值。原市场导航工作保持原样。

## 本地验证

所有命令在主仓执行，结果适用于本次相关源文件与现有依赖。

| 检查命令 | 最后结果 |
| --- | --- |
| `pnpm --filter @thesis-ledger/server exec vitest run test/providers test/automation test/notifications` | 83 通过；6 个既有 PostgreSQL 集成用例因未配置隔离环境跳过 |
| `pnpm --filter @thesis-ledger/api-client test` | 最终 42 文件、217 用例通过，新增旧服务不支持和混入正常记录的回归 |
| `pnpm --filter @thesis-ledger/desktop exec vitest run test/provider-failure-diagnostics.test.tsx test/provider-diagnostics-read-state.test.tsx test/providers-automation-ui.test.tsx test/provider-query-invalidation.test.ts test/providers-automation-error-toast.test.tsx test/providers-automation-run-delete.test.tsx` | 6 文件、29 用例通过 |
| `pnpm --filter @thesis-ledger/schemas build`、`pnpm --filter @thesis-ledger/api-client build` | 通过 |
| `pnpm --filter @thesis-ledger/server build`、`pnpm --filter @thesis-ledger/desktop build` | 通过；Desktop 保留既有打包体积提示 |
| `pnpm exec node scripts/check-boundaries.mjs` | 通过 |
| `GUARDRAIL_BASE_REF=HEAD pnpm exec node scripts/check-file-size-guardrails.mjs` | ratchet 通过，6 个既有尺寸告警未增长 |
| `pnpm exec node scripts/lint-workspace.mjs --guardrails` | 脚本通过，保留既有复杂度告警及 Mobile 依赖 Flow parser 诊断，不能称为无告警 |
| 新增诊断 TSX 模块定向 ESLint | 通过；浏览器脚本被既有 ESLint ignore 排除，另有真实执行结果 |
| `git diff --check` | 通过 |

保留失败经过：客户端首次测试使用尚未重建的 Schema 产物，构建 Schema 后合同测试通过。Desktop 首次刷新失败测试发现通用陈旧提示不适合诊断历史，改为“更新失败，保留上次记录”后通过。Server 旧 Controller spy 断言新增过滤参数后失败，更新断言后相邻回归通过。直接调用 Volta Node shim 的门禁版本解析失败，改用项目 `pnpm exec node` 后通过。未修改依赖或锁文件。

## 真实浏览器的受控验收

首轮使用独立 Vite 端口 `5192`，最终受控复验使用现有 `5173`，实际打开 `/providers` 的诊断页签。脚本 `apps/desktop/scripts/check-provider-diagnostics.cjs` 通过 `pnpm exec node apps/desktop/scripts/check-provider-diagnostics.cjs` 运行；`PLAYWRIGHT_MODULE` 指向临时 pnpm dlx 的 Playwright，`DIAGNOSTICS_CHROMIUM_EXECUTABLE=/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge`。缓存 Chromium 缺失 Framework，最终使用已安装的 Edge，没有覆盖浏览器。

全部 `/api/v1/**` 请求在浏览器内拦截并返回受控样本，非 GET 请求直接拒绝。1440、1024、768、390 四种宽度最终均通过，每个宽度 67 个请求、0 个写请求、0 个浏览器运行错误。覆盖独立分页、前后翻页、错误码、名称、结果待确认、通知重试中、刷新加载圈、刷新失败保留原记录、重新加载、首次失败与成功为空，以及页面无横向溢出。新增混入健康和成功记录的 HTTP 200 场景，明确显示读取失败。已查看桌面和窄屏截图，长表格在容器内滚动。

截图和 JSON 结果位于 `/tmp/provider-diagnostics-qa/`，为本机临时产物。该证据是实际浏览器加受控样本，不是目标 Docker 的真实业务验收。

## 用户截图复现与目标运行态修复

首轮仅完成本地修复时未同步 Docker。用户继续提供实际页面截图后，真实 GET 确认旧 Server 忽略 `issuesOnly=true`，仍返回健康检查 928 条和自动化全部历史 2103 条；只读检查容器内 controller/service 产物也没有新筛选代码。由此确认前端与目标 Server 不同步，原受控测试不能证明目标页面正确。

改用独立异常接口和严格响应校验后，通过正式入口同步。第一次同步后实际页面仍读取失败；进一步按路径提取 Schema 错误发现真实 AI 校验详情使用 `kind=ai_provider_validation`、`status=failed`，而旧连通性详情合同只接受旧格式。这不是翻页逻辑失败。来源异常接口随后只投影公共摘要，保留原存储详情不变；针对该真实输入增加 Server 回归，代码变化后执行第二次同步。

两次同步均在 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行 `./scripts/sync-code.sh thesis-ledger`，无非默认行为参数，均退出 0。正式预检通过，更新 `thesis-ledger`、`backtest-worker` 的 Server 和共享包可写层并重启，独立健康检查通过。镜像 ID 两次均保持 `sha256:744b2fdee55705ffe8fdd2ca62f0ca5c7f4a8cbe6ded00f27e0c0125f235141c`，未构建镜像或迁移数据库，未更新 DSA。

最终真实 HTTP 与共享 API client 直接解析均通过：来源第 1 页 20 条、第 2 页 19 条，总计 39，状态仅 `degraded`、`down`；自动化总计 1，状态 `unknown_outcome`。普通健康历史仍保留健康记录，未修改历史数据。

真实页面通过 `apps/desktop/scripts/check-provider-diagnostics-live.cjs` 在 `http://127.0.0.1:5173/providers` 验收，连接真实 Docker Server。业务 GET 正常放行，测试写请求直接拒绝。1440、1024、768、390 四种宽度均确认来源 39 条、自动化 1 条，没有健康或成功混入，前后翻页和刷新通过，无页面横向溢出、写请求和浏览器运行错误。截图前等待全部表格刷新区域结束，已查看桌面、窄屏截图；最终产物为 `/tmp/provider-diagnostics-live-qa/{1440,1024,768,390}.png` 与 `results.json`。

## 最终结论

AC1–AC6 全部通过。累计有效本地测试为 Server 83、客户端 217、Desktop 29，受控错误场景与真实运行态四宽度分别验收。目标 Server 已更新，当前页面已生效；此次为代码层同步，容器重建后须重新使用正式入口恢复当前源码，不能当作镜像发布证据。

未提交代码，未补造历史、修改数据库或重试通知。普通业务请求失败的统一持久化，以及研究、回测诊断不在本次只读历史接入范围，不能声称已覆盖全部失败。

## 分页列宽后续修正

用户补充第一页、第二页列宽变化截图后，确认原因为自动表格布局按当前页最长内容重新分配宽度。共享只读表格增加可组合的表格及列 `className`，来源异常和自动化异常两个分页表使用固定布局及语义列宽，窄屏维持容器内横向滚动。没有新增 CSS 选择器、渲染分支或修改全局表格组件的既有工作。

已核对共享表格的通知、数据质量和运行历史消费者，以及独立健康历史；本次稳定列宽契约作用于诊断页的两个分页表，其他页签和非分页表保留原布局。真实浏览器脚本新增逐列宽度比较，1440、1024、768、390 四宽度的来源第一页、第二页每列宽差均小于 1 px。Desktop 原有定向测试 24 项和类型检查通过，没有为此次样式变化新增单元测试。当前前端由 `5173` 的 Vite 服务直接读取源码，此次未修改 Server，无需再次重启 Docker。
