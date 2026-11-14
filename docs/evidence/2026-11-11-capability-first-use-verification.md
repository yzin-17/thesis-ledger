# 能力首次使用与自动验证证据

## 产品确认与盘点

用户于 2026-11-11 明确要求：未验证能力应尝试使用，一次跑通后视为验证通过；进一步选择“产品行为：首次真实使用可尝试，成功后保存验证状态”。

当前 `basic_market_price_route`、`configured_data_route` 已允许基础行情及多数显式配置能力在没有人工准入记录时使用。DSA 的 `account_access` 持久记录来自专用账号接口检查，`provider_health` 表示短时健康；两者都不能直接代表精确市场、周期与复权口径的完整真实调用成功。普通数据执行、新闻及事件还存在基于预先准入的门禁，需要区分能力尚未验证与真实数据合同、输入、权限或明确撤销条件。

实施与验收结果见[归档任务](../archive/tasks/2026-11-11-capability-first-use-verification.md)。

## 当前实现与本地验证

- DSA 新增 `thesis_ledger_capability_verification.py`，独立持有一次真实成功记录，不复用健康或账号权限表。按精确键、上游、来源配置、凭据上下文及适配修订计算私有 HMAC，原始凭据不落入验证记录。首次成功记录幂等保留，配置变化后读为未验证，迟到旧结果不采用；新实例可读取。
- `VerificationRequest` 在调用前固定候选来源，在完整应用结果和当前控制检查后发布。日线完整窗口、图表、普通查询／报价、事件及当前配置的精确诊断接入；fixture、错误和 partial 不认证。草稿凭据诊断不写入当前配置。
- 普通已适配查询可首次使用，新闻不再因缺少预先准入记录被阻止；明确撤销／无效记录、停用、凭据和输入校验保留。事件原文、证券身份及历史可见性继续作为每次请求的数据合同输入，不以一次能力验证代替这些事实。
- DSA 目录附带 `verification`；元数据在目录修订计算之后投影，成功记录不会无故改变执行政策／目录代次。已有未知账号访问状态在同配置能力成功后可投影为持久可访问状态。
- Desktop 复用现有 Select、Badge 与检查 Sheet：未知状态可尝试、成功显示已验证；触发器与选项使用同一标签，明确权限失败保持原因。当前配置的精确检查成功会刷新能力目录。

已执行的独立结果：存储 5 项；日线／图表／当前数据等 63 项；新闻、精确检查与独立 HTTP 61 项；事件原文保护修复后 64 项；新闻最终小范围 21 项；共享合同 1 项、Desktop 25 项、Server 37 项。集合有重叠，不累加为总通过数。

广回归覆盖 34 个登记的数据测试文件：523 通过、20 失败、耗时 109.50 秒。19 个事件失败由新增验证上下文提前读取凭据导致，已将初始化延后到原文与身份前置检查之后，相关 64 项复核通过。另一项 `test_exact_native_minute_bindings_do_not_invent_periods` 比较既有日线绑定数量 18 与旧断言 15；本次未改变日线绑定库存，不修改该断言，也不将广回归称为全绿。首次使用验证模块捕获 `functools.partial` 读取器时曾产生错误，已正确解析底层读取器后通过真实本地 HTTP 回归。

DSA 能力边界、运行打包合同、测试范围门禁通过（435 个测试目标）。Schema 构建后 Desktop 类型检查通过；使用旧 Schema 产物的第一次类型检查缺少新增字段，构建产物更新后解决。

最终相关 10 文件回归为 170 通过、8 个既有警告，覆盖事件、当前数据、完整日线与图表。Server 最终消费定向为 38 通过，新增断言验证目录投影保留成功元数据；Server 类型与构建、Desktop 类型及生产构建均通过。依赖边界通过，文件规模门禁报告六个既有大文件警告且退出 0；未提供基线，不扩大为全工作区规模无增长证明。所有 469 个登记绑定均可生成上下文修订。修改的 Python 文件通过 `py_compile` 与限定 flake8；新增 TypeScript、浏览器工具通过 Prettier，两仓 `git diff --check` 通过。

## 目标更新与真实首次使用

从 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行 `./scripts/update.sh all`，无附加参数，退出 0。系统依赖下载及 SDK 构建使本轮耗时约 16 分钟；没有中断或重复构建。PostgreSQL 按 `check` 模式校验业务结构，DSA、Server、Worker 及数据库、Redis 健康。镜像为：

- DSA：`sha256:f34796cac189c0b9866f8278273b2b690f57f71b2144f782eb99eae48e9740f4`。
- Server／Worker：`sha256:4a541fd6135c0ffd81aea7088e940bcbbb4b7edebb1a5c7f82266ddb7fe534ce`。

独立核对宿主与运行文件摘要一致：

| 文件 | SHA-256 |
| --- | --- |
| DSA `thesis_ledger_capability_verification.py` | `e16046580cd4079c6523c86870c52fd95a3ff0216b160d2295f5fb3261229766` |
| DSA `thesis_ledger_verification_request.py` | `9cb5bb2f0b8a973dbbc954f453a1d9e3e625a9f64c7a93627f8d606bcc4aea48` |
| DSA `api/thesis_ledger_bar_read_v3.py` | `8eceb54d2e8222c52833312f91c8e4ef47056b42a52043a12870eb502d910864` |
| DSA `thesis_ledger_price_route_access.py` | `bdf97d87074adb132da17c4727329f7f3402c9fed04c203ae16f223ed5c3b81e` |
| Schema `market-capability-verification.js` | `630b78343c0ac7929db8e836696b7fa369b0242879ecab0e8f4f712be107de72` |
| Schema `market-route-v3.js` | `1aeffb6083ecb8eb3b1477210f201e319ef5524c61b009ac490c33b8c01deeac` |

完整镜像使用 pnpm 部署目录，Schema 实际位于 `/app/node_modules/.pnpm/@thesis-ledger+schemas@file+packages+schemas/node_modules/@thesis-ledger/schemas/dist/`；未将旧快更目录中找不到文件当作源码缺失。

从 DSA 仓执行受维护的 `scripts/local-runtime/verify-capability-first-use.sh`，共同参数为 `--asset STOCK --adjustment hfq --start 2026-10-01 --end 2026-11-10 --target futu/futu`，分别指定两个 `--symbol`。正式数据 HTTP 返回后，由另一进程的新存储实例读取验证结果：

| 标的 | 首次状态 | 返回行数 | 保存状态 | 首次成功时间（北京时间） | 证据摘要 |
| --- | --- | --- | --- | --- | --- |
| `AAPL.US` | `unverified` | 29 | `verified`，配置版本 1 | 2026-11-11 18:35:56 | `5146f9bc44a035a0effcca9d159406996cedb8d30e919a9beed386fac52d62ec` |
| `00700.HK` | `unverified` | 27 | `verified`，配置版本 1 | 2026-11-11 18:35:57 | `db72498425a1febb63c4ab7988a1219325380b0b8ea8423eb60362d9520d09fa` |

两次均为 `upstreamReadPerformed=true`、`productionControlUnchanged=true`，共两次真实行情窗口读取。再次检查苹果直接复用记录，`upstreamReadPerformed=false`，成功时间及摘要不变。

为验证真实服务重启，仍从 infra 执行 `./scripts/sync-code.sh dsa`，使用相同源码与同一镜像，退出 0，没有重复构建。DSA 的 `StartedAt` 更新为 `2026-11-11T10:39:40.521340011Z`，镜像保持上述 DSA ID。重启后再次执行两个验证入口，均为原 `verified`、原时间及摘要，且均没有上游读取。Server 的正式目录 GET 仍返回 HTTP 200、`complete`、469 项，并保留两条验证记录。新功能源码已包含在完整镜像中，后续同字节快更仅用于本次重启验收。

真实页面 `/market-data` 的“数据源”页在 1440、1024、768、390 宽度下只读展开富途，均显示两项港美股股票后复权已验证，其他未验证能力继续有“可尝试”说明，横向溢出为 0，无页面异常。截图为 `/tmp/capability-first-use-qa/<宽度>-live.png`，已查看 390 宽度实际图片。

## 数据与范围核对

两次真实验证分别比较来源配置与路由摘要，前后完全一致。最终政策为 199、`applied`；修订 199 创建于 18:08:39，早于正式更新，与此前 198 的差异仅港股股票未复权来源，不属于本次能力验证写集，未将这项并发变化归因于本功能。

原失败任务 `6872cec3-34ce-4a57-984f-02e79092027e` 与 `95d46ed6-bb3f-4a24-aebf-07ddd3169b7f` 继续为 `failed/PREPARATION_FAILED`，结束时间分别保持 `09:04:34.058` 与 `09:05:09.098` UTC；本轮只请求行情，未创建或重跑回测。没有修改账户凭据、购买权限或遍历验证全部来源。

本轮代码未提交、推送。广回归中旧富途绑定数量断言的既有差异继续保留，其他定向与运行态证据按实际范围复用。回退可仅恢复本轮验证模块、调用点及显示投影后通过正式入口应用；新增验证表与业务历史可保留，不需要清库或删卷。DSA 专题设计及 `docs/CHANGELOG.md` 已同步，中文专题无成对英文页。

## 受控浏览器

复用本地 Vite 与实际业务组件，通过 `scripts/local-runtime/capability-first-use-browser.mjs` 验收：1440、1024、768、390 宽度均通过未验证来源可选、成功状态切换、选项与触发器回显一致、检查面板打开与 Escape 关闭。横向溢出均为 0，无页面异常。四宽各保存两个状态截图至 `/tmp/capability-first-use-qa`；已查看 390 宽度实际图片。受控成功状态不写入共享业务数据，不能代替真实来源验证。
