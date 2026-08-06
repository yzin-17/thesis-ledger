# ADR-011：场外基金净值使用独立 Contract

## 背景

证券 Quote 包含开高低收、成交量和成交额，并使用交易所代码。场外基金以每日或更低频率公布单位净值，没有盘中成交价和成交量；复用 Quote 会制造不存在的行情字段，也无法准确表达净值日期。

## 决策

场外基金使用带 `.OF` 后缀的全局 Asset 代码，并由独立的 Fund NAV Contract 提供单位净值、净值日期、Provider、抓取时间和新鲜度。基金账户的当前市值按份额乘最新可用净值计算；净值缺失或过期时保留不可用或陈旧状态。

## 后果

共享 schema、Provider 路由、缓存、Portfolio 与 Performance 估值需要按 Asset 类型选择 Quote 或 Fund NAV。截图识别可以提供待审核的净值信息，但不能替代后续 Fund NAV Provider。第一版必须与正式 DSA Fork 中的真实 Fund NAV Provider 同批交付和联调；正式 DSA Fork 仓库及写权限是实施硬前置，当前 contract stub 不得升级为生产数据服务。

## 替代方案

复用证券 Quote 会污染行情语义；只保存份额和成本无法形成基金账户的当前估值闭环，因此均不采用。
