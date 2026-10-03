# 旧回测路由与服务清理

## 调用核对与删除

- DSA 旧 `/api/v1/thesis-ledger/v2/*` 五条回测路由均已退出；Calendar 和 Instrument Facts 的生产调用此前已迁到 V3，Bars、Capabilities、Corporate Actions 的 Server 客户端方法此前确认无生产调用。旧 URL 返回 404。
- 删除仅服务旧 Bars 路由的 DSA 日线投影、十进制序列化与开盘时刻 helper；仍由当前 V3 读取使用的收盘可用时刻校验保留，并按实际职责命名。
- Server 的 `BacktestBarAggregationService` 只注册在 `MarketModule` 且无消费方；删除服务、注册和镜像其实现的测试。当前 Risk 和回测 Runner 所用的领域聚合函数仍保留。

## 验证与剩余边界

- DSA 合同、依赖和 V3 行情定向共 57 项通过；涉及文件 Python 编译、flake8、`git diff --check` 通过。首次全量因一项直接调用已删 `_real_bars` 的旧 facade 测试失败；删去这项只验证旧实现的测试后，Provider Runtime 定向 26 项通过，第二次官方离线全量 7596 项通过、1 项跳过、4 项未选。
- Server 类型检查、依赖边界和 `git diff --check` 通过；删除死服务后的全包 1684 项通过、81 项跳过。
- DSA 公共 V1 capabilities 仍返回旧 `backtestData` 元信息；Schema 的旧 Capabilities 类型及其他 V1/V2 领域残留、目标 Docker 与真实业务验收仍未清理，C03/E01/E04/D02/D03 不勾选。
