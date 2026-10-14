# C2.1：固定来源股票研究的现行日历接缝

> 日期：2026-10-06。对应[普通研究覆盖任务](../../archive/tasks/2026-10-03-multi-source-remaining-acceptance.md#research-next-queue)与[覆盖规格](../../specs/2026-10-03-multi-source-remaining-acceptance.md#research-window-policy)。
> 结论：C2.1 本地实现及正式 DSA 后端门禁通过。目标同步、扩展回测与页面验收仍归 C3，本叶不授予未知上市标的或严格历史资格。

## 改动与边界

复用 C1 已核验的 `calendar_fact`，解除明确股票研究请求的月份限制。DSA 新增 `src/services/thesis_ledger_research_calendar.py`，公共 API 将既有 coverage resolver 转交给它；原 `api/thesis_ledger.py` 从 1887 行减少到 1881 行。按日历来源与请求覆盖职责提取，没有增加第二套日历包或修改原月份字典。

仅 CN STOCK、腾讯精确 Provider／来源、日线 `none/qfq` 且显式采用 `assume-untradable-no-bar` 的请求，可以在原日历范围不足时补用现行来源。原窗口优先返回原日历；其他资产、来源、口径或未选择缺 Bar 假设的请求保持边界。未知上市事实继续不可用，C2.2 尚未接入，不将第一根行情伪造成上市日期。

复用来源仍检查锁定包源码摘要、版本、可用时刻及实际覆盖；投影进一步检查 CN、Asia/Shanghai、版本、精确范围和时钟。周末与来源休市日不生成会话，暂不支持的 Session override 不予投影。coverage 来源为 `exchange-calendars/XSHG`，revision 保存 `exchange-calendars-4.13.2-release-evidence-v1:availableAt=2026-03-10T03:24:37.055242+00:00`。这是现行版本可用时间，不声称 2023 年同期可见或严格 PIT。

公共 wire、共享 Schema、费用、基准、Builder／Runner、路由与数据库未修改；并行对话新增的 000995.SZ 上市事实及全部 WIP 保留。专题日历文档和 CHANGELOG 已补中文说明；原英文首页／双语文档未涉及此专题，无须同步。回滚本叶只需移除新增 helper 引用并恢复原 resolver，旧字典和已冻结窗口不需要改写。

## 协作与环境

用户授权继续 C2.1，并已授权与“历史市场规则来源核验”协调。该对话正在 P5.4 前补齐独立上市事实，说明目标同步等待本接缝源码稳定。本轮仅集成约定的 DSA 公共入口、新 helper／测试及日历文档／CHANGELOG，不写对方的状态、上市字典、Schema 或 Server 文件。开始时 DSA 57 个未提交路径保留，新增 helper 和测试后为 59 个；未 stage、commit、push 或清理。

本次不执行 Docker 状态变更、构建镜像、修改策略配置、重启 Vite 或创建真实回测。没有将本地门禁结果视为目标运行态已经更新。

## 验证

新增测试 `tests/test_thesis_ledger_research_calendar.py` 最终 **28 项通过**：实际锁定日历的扩展范围、周末／国庆休市及调休周末、旧窗口证明逐字段相等、非研究／非目标路由、未知上市、非法及过长日期、无时区／早于包发布时钟、错误来源／范围／时钟及包摘要失败。认证 HTTP 用受控行情输入贯通现行真实日历与原响应投影：未认证 401 且 Provider 未调用；扩展范围 200；缺 Bar 只返回 `assumed-untradable-no-bar`，不补价格；未知上市 422 且无额外 Provider 调用。

已有行情 V3、有限公告日历、日级状态、多窗口及独立上市回归连同新增初版测试共 **104 项通过**，其后新增的两个 HTTP 用例已在最终 28 项中通过。命令：

```sh
cd /Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis
rtk proxy .venv/bin/python -m pytest tests/test_thesis_ledger_research_calendar.py tests/test_thesis_ledger_market_v3_calendar.py tests/test_thesis_ledger_market_v3.py tests/test_thesis_ledger_market_tradability_common.py tests/test_thesis_ledger_multi_window_api.py tests/test_thesis_ledger_trading_status_listing.py -q --disable-warnings
rtk proxy .venv/bin/python -m pytest tests/test_thesis_ledger_research_calendar.py -q --disable-warnings
rtk proxy .venv/bin/flake8 src/services/thesis_ledger_research_calendar.py tests/test_thesis_ledger_research_calendar.py
```

新 helper／测试完整 flake8 通过。公共入口完整 flake8 仍有既存三项 F401、两项 E128；将本叶两处改动在内存还原后，相同五项仍存在，未为本叶扩大无关清理范围。正式 gate 使用的 critical flake8 与完整 flake8 是不同边界，不把前者当作后者全部通过。

三份改动 Python 文件显式 `py_compile` 通过；`none` 口径的相同扩展请求也实读现行来源并得到 50 个会话。两仓限定写集 `git diff --check` 通过，主仓 Spec／Task／证据共 35 个本地链接无缺失。

使用 [C1 保存的实际腾讯原文](2026-10-06-research-window-coverage-c1.md)验证 600000.SH 的 **50 根**日线。原生解析、当前 coverage resolver、日级状态和公共响应投影真实执行两次，固定原采集时钟后响应完全一致，禁止 HTTP 的调用计数 **0**；实际日期等于现行日历会话。结果指纹 `3a8111433781d0e31745bb65106a070647e9b895449021708c75fe71a3f85236`。现有构建的 `marketDataBarSeriesRequestResponseV3Schema` 实际解析通过，未修改 Schema 或其构建输入。

复核脚本：[保存原文投影](/private/tmp/thesis-research-calendar-c21-captured-20261006.py)；输出：[现有合同载荷](/private/tmp/thesis-research-calendar-c21-captured-20261006.json)。这是实际来源保存数据的本地合同复验，Provider runtime 用保存数据的执行封套，不是新目标 HTTP、准备、回测或 Runner 重放证据。临时文件不作为产品依赖。

正式门禁：在 DSA 仓库将 `.venv/bin` 前置 PATH 后执行 `bash scripts/ci_gate.sh all`，由 `rtk proxy` 捕获输出；没有跳过或放宽检查。日志：[后端门禁](/private/tmp/thesis-research-calendar-c21-gate-20261006.log)。退出 **0**，语法、critical flake8、确定性检查及离线全包通过；**7927 passed、626 subtests passed、1 skipped、4 deselected**，离线测试耗时 192.32 秒。跳过及 network 排除不计为通过。验证输入包含保留的并行上市事实及本叶最终源码，门禁期间本叶生产／测试源码未再修改。

## 验证源码身份

| 文件 | 行数 | SHA-256 |
| --- | --- | --- |
| DSA `src/services/thesis_ledger_research_calendar.py` | 80 | `50a81483059239c7b16784994d886d0d72d61fca55714313df8c945e58a2c7e1` |
| DSA `api/thesis_ledger.py` | 1881 | `430d5b5101fb5f0d09672094bc140dde1a8965802a1b1cee8a68afd394899340` |
| DSA `tests/test_thesis_ledger_research_calendar.py` | 173 | `cf26016afc28342e8653579791c68a65492fabafcd6ba1d7f02b24f1bb7ea7b3` |

## 最终审查与剩余工作

最终一致性审查通过本叶本地范围：旧窗口及原来源限制保留，已知上市的扩展月份使用真实日历，未知上市不伪造，缺日不冒充停牌，现行可用时间不冒充历史可见；实际来源保存数据、HTTP 受控集成、共享合同、定向检查及正式门禁均有对应证据。C2.1 已勾选；C2.2 上市研究合同及 C3 目标验收仍未完成，PR-AC07 产品验收保持未完成，整项 Task 不归档、不移入 TODO。源码稳定通知交还原对话，其后续同步仍须独立核对实际运行与 P5 业务场景。
