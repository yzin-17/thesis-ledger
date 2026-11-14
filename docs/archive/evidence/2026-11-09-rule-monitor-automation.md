# 规则监测版本查看与自动化接入验证记录

## 初始诊断

- 2026-11-09，宿主开发页面 `http://localhost:5173/market-data`，1440×900。
- 仅允许 GET/HEAD，其他请求阻断；点击首行“查看版本”。接口返回200、1个版本。
- 表格32行，版本详情顶边位于视口内坐标2727.5，视口高度900，页面未滚动。证实内容已读取但展示在视口之外。
- 临时诊断入口：`/tmp/inspect-rule-monitor-versions.cjs`。运行命令：在 `apps/desktop` 执行 `pnpm exec node /tmp/inspect-rule-monitor-versions.cjs`。
- 自动化基线：`AutomationService.list/history` 只查询本地任务及执行表；监测任务及版本由 DSA 独立 SQLite 持久化。未执行配置修改或真实检查。

## 已完成的本地验证

- DSA：临时真实 SQLite 与认证 HTTP 共15项通过，包含版本1增量升级保留配置、任务、观察和版本，手动/定时触发、逐次失败保留、过期提交拒绝、分页、仅异常、认证和输入限制。命令在 DSA 根目录执行：`uv run --no-project --with pytest --with fastapi --with httpx --with pydantic-settings python -m pytest -q tests/test_rule_monitor_store.py tests/test_rule_monitor_history.py tests/test_rule_monitor_runtime.py tests/test_rule_monitor_fetch.py`。宿主测试环境为 Python 3.15.2，目标 Python 运行态独立验证。
- DSA 测试清单：登记新增历史测试；同时补登记仓库已跟踪、此前遗漏的只读筹码诊断测试 `tests/test_chip_provider_account_probe.py`，未修改其实现或测试。`python scripts/data_test_scope.py` 通过，419个数据测试文件、421个精确入口。原始失败是两个文件未登记，未跳过收集门禁。
- 共享 Schema：2项监测契约测试通过，历史样本由 DSA 受控 SQLite 和固定时钟生成。API client：9项自动化/诊断契约测试通过，包含部分失败、空开始时间和来源读取缺口。
- Server：6个定向测试文件、58项通过，覆盖两源交错/同刻/微秒排序、深页有界读取、来源失败降级、只读托管任务写入拒绝及原有自动化入口。命令：在 `apps/server` 执行 `pnpm exec vitest run test/automation/automation-history-page.test.ts test/automation/rule-monitor-automation.test.ts test/automation/automation-runtime-foundations.test.ts test/automation-runtime.test.ts test/http-validation.test.ts test/providers/diagnostic-history.test.ts`。
- Desktop：相关自动化/诊断/版本测试共32项通过，其中版本面板7项、其余相关文件25项；最后增补的版本失败重试与加载/空记录测试包含在7项内。保留原有部分失败、版本只读及请求幂等断言。Mobile：新增任务和部分失败/中断标签测试1项通过。
- Schema、API client、Server、Desktop、Mobile 包构建全部通过；Server/Desktop/Mobile 类型检查通过。Mobile 未改原生依赖或工程配置；未将 TypeScript 检查视为原生运行验收。
- 导入边界检查通过。14个本次修改的核心模块及后续5个筛选/表格模块以复杂度20、函数220行及禁止嵌套三元的严格等级检查通过；文件尺寸门禁有6项既有警告。大型设置组件通过提取有明确职责的任务范围 Hook 缩减函数；未提高阈值、增加忽略或关闭规则。
- 全仓 `lint-workspace.mjs --guardrails` 失败于其他 Server 测试的未使用变量（例如 `test/quality/data-quality-observation.test.ts`），并存在多处存量复杂度警告；未据此声称全仓 lint 或 CI 通过，未修改这些无关代码。

## 实际浏览器与受控操作边界

脚本：`apps/desktop/scripts/check-rule-monitor-automation.cjs`。在 Desktop 目录执行，使用已安装 Playwright 和 Edge，并以 `PLAYWRIGHT_MODULE`、`CHROMIUM_EXECUTABLE` 指定实际工具路径。

- 1440、1024、768、390：真实已保存资料的版本详情均立即出现在视口内，支持关闭、第二条资料和关闭后焦点返回；版本接口均为200。
- 同四宽度：自动化列表、历史、异常页以受控契约响应验证，显示任务名、部分不可读、该次原因和读取缺口；设置入口跳转至实际监测页签。
- 同四宽度：实际自动化页面选择“收费资料更新检查”后，请求携带 `jobId=rule-source-monitor`、页码回到1、总数为2且返回记录均属于该任务；历史未保留逐项原因的提示可见，切回全部任务正常。查询键与缓存沿用同一任务范围。最终浏览器脚本四组全部通过，写请求为0；早期脚本对 Select 的可访问名称及装饰箭头断言不符，按共享 Field 的“任务”标签修正后通过。
- 全过程阻断非 GET/HEAD，未保存真实设置、启用自动检查、触发外部资料读取或通知。临时截图位于 `/tmp/rule-monitor-automation-qa/`，不进入 Git。
- 目标同步前只读基线：监测配置修订1、自动检查关闭、来源为空；最近执行 `580aee12-245e-4339-9b46-5e5ca280228c` 为部分失败，32条观察、累计31个资料版本。

## 目标运行态验收

正式入口：在 `thesis-ledger-infra` 执行 `./scripts/sync-code.sh all`，目标仅 `dsa thesis-ledger backtest-worker`。首次在任何部署操作前因已有更新锁退出；确认锁已释放后再次执行，未移除他人锁。第二次退出码0，完成宿主构建、三服务代码装配及重启，三服务均健康。该入口只更新可写层，不能证明镜像更新或生产发布。

- 目标 DSA 为 Python 3.11.18；新增模块随目标服务正常装载并成功读取已有 SQLite 历史，独立于宿主 Python 3.15.2 测试。
- 同步前后镜像标识相同：DSA `sha256:86ace638a1fb6072e125ccd1fe9a9a0b5b469eed033cec8a668e3c671de640ed`；Server/Worker `sha256:744b2fdee55705ffe8fdd2ca62f0ca5c7f4a8cbe6ded00f27e0c0125f235141c`。
- `GET /api/v1/automations` 返回200、8项任务，包含“收费资料更新检查”，自动检查为关闭。
- `GET /api/v1/automations/history?page=1&pageSize=20` 返回总数2105，其中原本地记录2103条、监测记录2条；`GET /api/v1/automations/issues?page=1&pageSize=20` 返回2条异常并包含监测部分失败。
- `GET /api/v1/automations/history?jobId=rule-source-monitor&page=1&pageSize=20` 返回2条：11月9日 `580aee12-245e-4339-9b46-5e5ca280228c` 部分失败，11月5日 `6590ccdf-0968-48a4-80f3-218938d8d06a` 成功。旧记录触发方式未知，缺少逐项失败原因时明确说明；未利用最新观察补造历史。实际读取无来源缺口提示。
- 同步后监测基线不变：配置修订1、自动检查关闭、来源为空；最近执行仍为原记录，32条观察、累计31个版本。没有通过触发新检查制造验收记录。

## 最终一致性复核与边界

版本入口、持久化与升级、读取契约、两源分页、任务与异常投影、两端消费及目标页面符合 AC1–AC7。新失败明细按执行冻结，旧历史未知信息保持未知；DSA仍是监测执行事实源，没有新增第二个调度器。真实页面验证覆盖 Desktop，Mobile 为标签测试、类型检查和构建，未计原生设备或原生编译验收。全仓 lint 的存量失败、未运行 CI 和可写层更新的范围均保留，不扩大结论。

监测库已增量升级至 SQLite 结构版本2；回退代码时必须继续支持该结构，不能用清空数据库恢复旧版本。现有历史和资料版本保持，未迁移 PostgreSQL 业务结构。
