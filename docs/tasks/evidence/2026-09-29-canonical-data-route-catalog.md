# 当前数据路由的精确能力目录

## 修复范围

- DSA 的 V3 能力目录现在登记已核对源码调用的 `data` 目标：HiThink 股票及 ETF 快照、AKShare 股票的东财/新浪/腾讯报价、Efinance 股票及 ETF 东财报价，以及已绑定东财方法的基金净值、持仓和 AKShare 筹码。没有单标 ETF 报价适配器的 AKShare 目标继续不可用。
- 目录 `ready` 需要当前 RouteAdmission、适配器/来源修订、凭据修订及有效期；HiThink 快照还按当前标的和交易日核验凭据快照。仅在宽 Provider manifest 声明能力，不会产生可执行目录目标。Server 的现行 Policy 目录校验因此能看见这些精确目标。
- 通用 Gateway 在来源调用前核对当前准入的标的和日期范围，返回前再次核对 Policy 修订、实际目标和准入。调用中撤销的结果拒绝返回。旧来源别名不能凭 manifest 自行进入目录。
- 旧的 V2 路由测试与普通日线夹具已经移除；仍被当前源码使用的 Provider 适配器保留。筹码测试改为确认 Efinance 的宽 manifest 声明不能伪造后备适配器。

## 验证边界

- DSA 定向 65 项通过；相关 Python 文件 `flake8` 通过，`git diff --check` 通过。
- DSA 离线全包复核为 7561 项通过、1 项失败、1 项跳过、4 项网络测试排除。唯一失败是筛选模块的 `test_hotspot_provider_detail_fallback_reuses_one_configured_deadline` 超时；按一次重试规则隔离重跑 1 项通过。全包因此记录为未通过，不能把隔离通过当成全包通过。上述测试使用本地模拟来源和隔离 SQLite；目标 Docker、Server→DSA 真实 HTTP、当前策略实际保存、AKShare/Efinance/HiThink 外部接口与业务验收均未执行。
- 其他市场及 Provider 的报价、基金与筹码精确适配器仍须按真实来源逐项接入。E04-c/d、D02/D03 和原 M1/M2/M3、AC01–AC20 保持未完成。
