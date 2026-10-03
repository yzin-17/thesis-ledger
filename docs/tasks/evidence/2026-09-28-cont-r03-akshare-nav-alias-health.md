# AKShare 场外基金净值别名健康作用域本地实施

日期：2026-09-28。任务：`CONT-R03-akshare-nav-alias-health`。结论：限定本地实施完成；真实来源及完整别名迁移仍开放。

## 合同与写入

当前 `ThesisLedgerProviderRuntime._fund_nav_from_provider` 对 `FUND_NAV` 与 `FUND_NAV_HISTORY` 均调用 AKShare adapter 的 `get_fund_nav_history`，不根据 RouteTarget source 切换读取器。因此每种能力内的 `akshare`、`eastmoney` 与 V1 无 source 属于同一实际请求作用域；两种能力之间仍独立。先在主 Spec §4.1 和 Task §12.9 固定此合同，再修改 DSA `src/services/thesis_ledger_source_alias_identity.py`、新增 `tests/test_thesis_ledger_akshare_nav_alias_health.py`，并把股票别名旧测试中的无关能力断言改为 `FUND_HOLDINGS`。DSA 能力目录两条净值行同步说明健康兼容；目录内 AKShare manifest 版本按当前源码从 2 更正为 3，并说明该版本已登记股票报价。

目录补齐 AKShare `eastmoney` 精确 source 下的正式/历史净值两条 manifest 原子行；逐行重计当前 §2/§3/§4 为 35/65/38，15 个 Provider × source ID 不变。旧 P02-b 的 34/57/38 作为当时自检保留，不再冒充当前表格数量。

未改 RouteTarget、策略、执行 provenance、来源准入、事实或冻结身份。Efinance 净值上一叶 `skipped_after_retry` 未重启。三仓其他未提交工作均保留，无 stage、commit 或目标更新。

## 红绿及相邻检查

- 新测试修前 10 failed：旧/新/V1 持久健康行互不读取，进程内别名切换可绕过熔断；过期探测测试的初始回调也返回空值，修正夹具为返回有效值后验证生产逻辑。
- 修后新测试 12 passed；包括公开 Runtime 净值请求在旧 open 时零次调用 adapter、双向别名与 V1 旧键、过期半开且旧行不改写、进程内连续失败、正式/历史净值互相隔离。
- 相邻 8 个测试文件 98 passed：AKShare 股票、Efinance 股票、旧来源健康、V2 路由、Control V1/V3 和 Provider Runtime。相邻命令首次写入不存在的 `test_thesis_ledger_control_v2.py`，pytest 未收集任何项；更正为实际 `test_thesis_ledger_control.py` 后一次通过。该命令错误不属于生产测试失败。
- 三个 Python 改动文件的 `flake8` 与 `py_compile` 退出 0。四个 DSA 文件逐行检查无行尾空白且以换行结尾；这些文件当前为未跟踪 WIP，`git diff --check` 对其无覆盖，故另做字节检查。

本叶未请求真实 AKShare/EastMoney、未运行此前已失败的 DSA 官方完整离线门禁，也未同步目标容器。`R03.1–R03.4` 的披露时间、修订与完整历史覆盖，旧别名完整迁移、G0-M、AC20 和最终一致性验收均未通过。
