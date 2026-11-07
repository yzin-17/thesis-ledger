# 标的搜索选择公共组件实施

关联：[Spec](../specs/2026-11-06-instrument-picker.md)

## 当前状态

通用选择器及衍生品候选入口验收完成，包级独立失败与仓库门禁已收敛；完整持久化合约目录仍按下方接续范围保留。工作区已有大量 Desktop/Mobile/Server 修改，本任务只增量修改标的输入及选择职责；不碰 Drawer 基础布局、凭据、数据库或 Docker。

## 阶段与门禁

- [x] 读取仓库规则、依赖、现有组件与目录 API，完成初步入口盘点。
- [x] 建立公共搜索选择组件与定向测试。
- [x] 接入 Desktop、Mobile 可编辑代码入口，检查市场和类型约束，逐项覆盖及来源限制见证据。
- [x] 定向测试与两端 typecheck/build。
- [x] 本轮输入的包级验收：11-07 冻结输入的隔离 Desktop 255 文件 / 1629 项及 Mobile 52 文件 / 231 项、对应构建通过，见[最新本轮包级证据](../evidence/2026-11-07-arena-detail-refresh.md#最终验证)。Desktop 结论对应冻结副本，主工作区并行策略编写改动的失败与输入边界另有留证，不表示整个共享工作区全绿。Mobile 遗留策略库用例为多请求复用同一响应体的旧替身问题，按端点返回新响应后保留全部筛选及身份断言通过。
- [x] 仓库边界与尺寸门禁：11-07 随 Desktop 公共导航复核完成边界、依赖和尺寸门禁，见最新 Desktop 证据；Mobile 包级结果由其稳定输入证据独立持有。
- [x] 关键定投业务组件与公共组件浏览器验收（1440/1024/768/390）；真实本地目录只读验证通过。

## 实施边界

共享组件属于客户端 Market 目录选择职责。保留 Portfolio 业务确认编排；不把适配器或业务编排上移 packages。不修改其他并发任务的状态或通过结论。

## 工具与验证记录

- shadcn：目标目录 pnpm exec shadcn info --json / docs combobox input-group 因沙箱无法连接本机代理失败，已检查本地 Base UI 实现与官方 combobox 文档。
- recommend：核对 es-toolkit 1.51.0 的实际导出、debounce 声明及实现；采用 trailing debounce(fn, 300)，清理 cancel()。官方文档 https://es-toolkit.dev/reference/function/debounce.html 。
- [完整入口清单与最终命令结果](../evidence/2026-11-06-instrument-picker.md)。公共搜索归入 market-data 查询前缀，可随目录/页面缓存失效，保留 30 秒 staleTime。
- 尚未同步 Docker 运行态，未改凭据或扩大 Provider 权限；仅查询了既有本地 Instrument 目录。
- 全量测试失败的具体断言、文件、归属及本机 Node 26 运行参数见证据。未修改这些独立业务组件以清除失败。

## 衍生品接续（2026-11-07）

- [x] 查明目录生产侧只加载 STOCK/ETF/MUTUAL_FUND，资料合约输入使用另一代码合同。
- [x] 只读核对现有 policy revision 189：期货日行情及 ETF 期权清单路由已 applied/ready；未修改任何来源配置。
- [x] 通过既有资料 API 建立合约候选公共投影与两端选择入口，保留显式来源/日期/分页。
- [x] 投影及两端组件共 9 项新增测试、两端编译/构建、Desktop 四宽度浏览器及实源选择通过；API Client 208/208。
- [x] 原 4 项最后稳定复核：定投列表已由并行更新收敛；其余 3 项不经过本任务新增字段，详见证据及摘要稳定性记录。
- [ ] 完整持久化合约目录：当前明确不覆盖连续/主力目录、三位年月映射、大商所及近月以外期权；具体最小方案已记录，不伪造候选或新增受限来源。
