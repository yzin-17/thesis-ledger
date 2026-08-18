# ADR-011：场外基金净值使用独立 Contract

## 背景

证券 Quote 包含开高低收、成交量和成交额，并使用交易所代码。场外基金以每日或更低频率公布单位净值，没有盘中成交价和成交量；复用 Quote 会制造不存在的行情字段，也无法准确表达净值日期。

## 决策

场外基金使用带 `.OF` 后缀的全局 Asset 代码，并由独立的 Fund NAV Contract 提供单位净值、净值日期、Provider、抓取时间和新鲜度。基金账户的当前市值按份额乘最新可用净值计算；净值缺失或过期时保留不可用或陈旧状态。

## 后果

Fund NAV 作为 DSA Contract V1 的向后兼容扩展，由同级正式仓库 `daily-stock-analysis` 提供 `GET /api/v1/thesis-ledger/market/fund-nav`，并在 `capabilities` 中显式声明。主仓 `thesis-ledger` 只维护共享 Schema、客户端、缓存和估值消费逻辑，不直接接入基金数据源；`thesis-ledger-infra` 负责固定兼容镜像、源码 override 和三仓版本矩阵。仓库边界遵循 ADR-014。

共享 Schema、Provider 路由、缓存、Portfolio 与 Performance 估值需要按 Asset 类型选择 Quote 或 Fund NAV。截图识别可以提供待审核的净值信息，但不能替代正式 Fund NAV Provider，也不能写入官方估值缓存。

正式 DSA Fork 已位于同级仓库 `daily-stock-analysis`，并已提供 Fund NAV capability、确定性 fixture、真实 Provider 路径、Contract Test 和接口文档。主仓 Stub 仅用于确定性契约测试，不得升级为生产数据服务；三仓版本由基础设施矩阵锁定。

## 替代方案

复用证券 Quote 会污染行情语义；只保存份额和成本无法形成基金账户的当前估值闭环，因此均不采用。
