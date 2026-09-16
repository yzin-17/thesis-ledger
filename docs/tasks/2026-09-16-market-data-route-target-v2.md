# 市场数据 RouteTarget V2 实施任务

对应 Spec：[市场数据 RouteTarget V2 Spec](../specs/2026-09-16-market-data-route-target-v2.md)

> 状态：T1–T3、当前 Docker、Tencent 主源与主路径性能完成；AkShare/EastMoney 真实备用源门禁未通过

## 任务

- [x] T1：建立共享 RouteTarget V2 Schema、类型和 Server DSA client 入口
  - 覆盖验收标准：AC1、AC5、AC7
  - 依赖：无
  - 涉及范围：`packages/schemas`、Server DSA client、Desktop 非视觉数据类型；不切换现有视觉组件或公开 endpoint。
  - 完成条件：Policy、Effective Policy 和 route provenance 可解析；Server 可显式发起 V2 handshake/apply/effective。BarSeries V2 不属于本任务。
  - 验证方式：Schema 定向测试、Server 受影响包 typecheck。
  - 验证证据：`pnpm --filter @thesis-ledger/schemas test` 共 20 个测试文件、181 项测试通过；Schemas build、Server typecheck 与 Server Control 定向测试通过。持久化的旧 `ProviderId[]` 策略在运行时 fail-closed，不保留隐式兼容迁移；开发重建前通过一次性、精确旧值匹配的数据准备把 ETF 默认转换为 `tencent/tencent → akshare/eastmoney`。

- [x] T2：实现 DSA V2 Policy 校验、持久化投影和 source-pinned runtime
  - 覆盖验收标准：AC2、AC3、AC4、AC5、AC6、AC7
  - 依赖：T1 的共享字段语义已就绪。
  - 涉及范围：DSA Control store/API、Provider manifest、ThesisLedger Provider runtime、AkShare source-specific daily adapter；保留 native analysis 独立 namespace。
  - 完成条件：目标级 source 校验、顺序回退、目标级健康 scope 和 provenance 成功；ETF 策略可应用。
  - 验证方式：DSA V2 路由测试及既有 Control/runtime/gateway 回归测试；`py_compile`。
  - 验证证据：DSA market V2、RouteTarget runtime 与 Tencent 定向测试共 52 项通过，Control/contract 回归通过，修改 Python 文件 `py_compile` 通过；Tencent 与 AkShare 精确 adapter 接受 4.5 秒目标预算，默认双目标顺序执行上界约 9 秒。目标单次调用、source pinning、目标级健康/熔断和纯指标零行情请求均有测试覆盖。运行态复核发现非 DAILY_BAR 默认 target 曾错误复用 `eastmoney`，现已改为 `akshare/akshare`、`efinance/efinance` 的直接 source；manifest 明确声明 direct source，新增每项 capability 至少存在一个可执行 source 的断言，相关 DSA 31 项与 Server Control 12 项定向测试通过。真实 Tencent `qfqday` 仅提供 OHLCV；精确源入口现按既有 volume-only Provider 规则以 `close × volume` 归一化有限 `amount`，通用 Tencent 抓取行为保持不变，新增用例后相关 28 项测试通过。

- [x] T3：完成公开市场 `/api/v2` endpoint 切换与客户端互操作
  - 覆盖验收标准：AC7、AC8
  - 依赖：T1、T2，以及 Phase 2 BarSeries/cache 任务的已验证契约。
  - 涉及范围：公开 bars/detail/indicator 路由、最终客户端 adapter 和部署版本矩阵；不在本任务提前实现缓存或消费者迁移。
  - 完成条件：公开 V1 wire 不再作为兼容层，V2 payload 在当前 Server/DSA 运行态完整往返。
  - 验证方式：主仓/DSA 互操作测试和指定运行态门禁。
  - 验证证据：Server 已提供 `/api/v2/market/:symbol/bars`、`indicator`、`detail`，旧公开 `/api/v1/market` 读取入口已移除；API client 直接返回 `MarketDetailResponseV2`，不再生成 `version: 1` 的 bars/indicator 详情视图；Desktop 通过命名的 `MarketChartBar`/`MarketChartIndicator` 展示模型消费 V2 series/result，未改变视觉布局或交互。API client 11 项测试与 build、Desktop 市场详情 28 项定向测试/typecheck/build、Server detail 4 项定向测试/typecheck 均通过；当前 Docker 对旧 `/api/v1/market/...` 返回 404，并能读取 V2 policy。

- [ ] G1：真实 Provider 与目标级性能/运行态门禁
  - 覆盖验收标准：AC4、AC6、AC8
  - 依赖：T1、T2、T3；需要当前 DSA、Server 源码和目标配置。
  - 涉及范围：Tencent 主目标和强制 AkShare/EastMoney 备用目标；不执行 Docker/update 或清理。
  - 完成条件：目标级调用、失败回退和真实 provenance 通过；冷主源 ≤5s、主源失败备用成功 ≤10s。
  - 验证方式：真实 Provider smoke 与目标运行态请求；fixture 不可替代。
  - 验证证据：当前 revision 24 在 Server/DSA 均为 `applied`，三服务由 `./scripts/update.sh all` 更新并健康；旧公开 v1 返回 404。真实 `510300.SH/qfq` 冷请求 1.356s，返回 90 点且 provenance 为 `tencent/tencent`、`routeIndex=0`。强制 `hfq` 会跳过不支持该复权的 Tencent 并进入 `akshare/eastmoney`，但 EastMoney 当前对 90 日和 3650 日窗口均以 `RemoteDisconnected` 主动断连；公开接口在 1.431s fail-closed 返回 503。因此顺序回退与总预算成立，但“备用真实成功”门禁尚未通过，不能用 fixture 替代。

## 验收映射

| AC / 断言 | 实现责任任务 | 验证责任任务或门禁 |
| --- | --- | --- |
| AC1 / RouteTarget 字段、唯一性、最多两个 | T1 | T1 |
| AC2 / source manifest 与 Policy 校验 | T2 | T2 |
| AC3 / source pinning、禁止隐藏 fallback | T2 | T2 |
| AC4 / 顺序回退与目标级状态 | T2 | T2；G1 |
| AC5 / exact provenance | T1、T2 | T1、T2 |
| AC6 / ETF 默认主备策略 | T2 | T2；G1 |
| AC7 / Server↔DSA V2 互操作 | T1、T2、T3 | T3 |
| AC8 / 工程与运行态门禁 | T1、T2、T3 | G1；最终 Review |

## 最终一致性 Review

- [ ] Spec 的全部验收断言均有明确实现与适当验证
- [x] 已完成任务满足自身完成条件且证据仍有效
- [ ] 必要集成、真实 Provider、Docker 与 endpoint 门禁均已通过
- [x] 启动依赖、验收依赖与契约就绪证据无循环
- [x] 跨任务接口、类型、状态、错误和副作用语义一致
- [ ] 不存在未解决的实现、契约或运行态阻塞
- [x] T3 与 Phase 2 已冻结 BarSeries V2，并完成公开 V2 endpoint 与客户端切换
- [x] fixture、定向测试和 `py_compile` 的证据边界已记录
- [ ] 公开 endpoint、Docker 和真实 Provider 门禁完成

### Review 结论

- 结论：T1–T3、当前 Docker、公开 V2、Tencent 主源和主路径 deadline 均通过；整体 RouteTarget V2 仅等待 AkShare/EastMoney 真实备用成功门禁。
- 已确认的问题及责任任务：备用目标实现、source pinning 和 4.5 秒目标预算已通过测试及真实失败路径验证；当前阻塞来自 EastMoney 上游主动断连，不通过隐藏 source 回退规避。
- 尚未通过的必要门禁与阻塞原因：AkShare/EastMoney 备用源的真实上游在当前网络环境主动断连；主源、公开 V2、Docker 与 deadline 均已验证。
- 遗留风险：外部备用源恢复前，主源不适用或失败的请求会在预算内 fail-closed，而不是返回伪造数据或隐藏切换到其他 source。
- 验证命令/过程、结果与证据引用：见 T1/T2/G1 验证证据。
- 提交状态：未提交，保留共享工作树及其它用户修改。
