# C3.1：消费者优先更新及目标版本核验

> 日期：2026-10-07
> 对应任务：[C3 目标验收](../../archive/tasks/2026-10-03-multi-source-remaining-acceptance.md)
> 结论：本叶通过；目标已使用 C2 的上市信息未知合同与结果说明代码。C3.2 真实回测、C3.3 离线重放及 C3.4 页面验收仍未完成，C3 父项与 PR-AC07 保持未验收。

## 输入、协调与更新入口

开始时主仓 679 条、DSA 64 条、infra 49 条未提交记录，已有工作保留。“历史市场规则来源核验”确认窗口内没有源码或目标更新，并将在 P5.4c 验收前核对本轮新版本。目标基线为 policy40／dsaRevision40／applied、8 条路由；Server、Worker、DSA 均运行且健康，未发现相关临时更新锁。宿主可用空间约 11GiB；未构建镜像、清理缓存、镜像或卷。

C2.2c 九项输入摘要仍为 `dd5e73a0e4485e54ec0879803822669be25fed1d8a13e3905a10e66cacfb1e96`；C2.2b2a 八项输入摘要仍为 `21692f2ce1c533095fa9186abd4f71429b2a82bebd488cbf9b20fd7bab7e1384`。此前包级测试、类型检查、构建及仓库门禁的输入保持，无需重复全量验证。P5 已有上市事实字典保持在当前源码及 DSA 同步范围中。

实际入口均在 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行，经 `rtk proxy` 捕获日志，默认参数：

1. `bash ./scripts/sync-code.sh thesis-ledger`：退出 0，兼容预检通过，正式构建 Server 和 workspace 包，同步并重启 Server／Worker，等待健康。
2. 前项成功后执行 `bash ./scripts/sync-code.sh dsa`：退出 0，requirements 兼容预检通过，同步 DSA 代码及脚本管理的 Web 产物，重启并等待健康。

没有使用 `all` 的 DSA 优先顺序；没有放宽依赖或 Prisma 预检，没有执行完整镜像更新或数据库结构变更。Schema 版本更新前后均为 `20261006030000_strategy_authoring_save`。

| 目标 | 更新前后相同的镜像 ID |
| --- | --- |
| Server／Worker | `sha256:95d8e518ffee019a8a29a13979b4fd9736f914153c4b78c636d6e0866c87a0b0` |
| DSA | `sha256:08bfe1b5a0d59d6b27c54e961a5850f603885b4686d459818897c68d3bcd250e` |

三项容器 ID 也保持。此次更新位于容器可写层，容器重建会恢复镜像代码；不作为不可变镜像发布证据。

## 独立运行身份及真实接口

新增只读入口 [research-window-target-check.mjs](../../../scripts/research-window-target-check.mjs)，通过实际启动目录 `/app/apps/server/dist` 及 workspace 软链接核对：Server／Worker 各 6 项执行产物、各 3 项 Schema 产物，以及 DSA 7 项 API／上市／日历／可交易性源码，共 **25 项 SHA-256 一致**。该集合的规范 JSON 摘要为 `10643e67ccce3da1ad98f43cd41ae394dfb841216ce237b12023d04048b148ac`，具体路径和哈希见 [目标输入记录](2026-10-07-research-window-target-c31-input.json)。

初次只读核验把 `market-window-selector-v3.js` 的目录误写为 `market-data`，因文件不存在退出；按宿主及实际产物目录改为 `market` 后通过，没有重复部署或更改产品代码。

使用 DSA 内部 HTTP 和已有 Data Token 请求 `/api/v3/thesis-ledger/market/bars`，请求区间 2023-07-08～09-15，显式 `assume-untradable-no-bar`，精确绑定 CN STOCK／Tencent／Tencent／日线／qfq／routeIndex0。没有响应拦截、离线替代或凭据输出。

| 标的 | 实际行情 | 上市信息 | 输入指纹 |
| --- | --- | --- | --- |
| 600000.SH | 50 根，07-10～09-15 | 保留 1999-11-10 及原始公告来源、revision、knownAt | `76a353d5d4f8b32f840c308a8b46eb049f415ebe59afdc1228ba1f1a1de63dc6` |
| 600519.SH | 50 根，07-10～09-15 | `{symbol:"600519.SH",status:"unknown"}` | `c2071a9a56925692189dc35fbf5d16b17c47af692545b4a1194b77dc514df77b` |

两份响应来源均为 Tencent，effectivePolicyRevision40；完整响应分别由目标 Server 和 Worker 实际加载的 `marketDataBarSeriesResponseV3Schema` 解析，共 4 次通过。未知上市没有伪填日期，已知事实仍完整保留。此处证明真实接口与目标消费者合同兼容，尚不证明回测准备、持久任务或结果页面完成。

## 配置及旧业务身份保护

更新前后 policy 的 revision、dsaRevision、syncState 和全部 8 条路由对象逐项相等；没有修改 Provider 配置、路由或 Token。

标准 `GET /api/v1/backtests/runs/:id` 再次读取两份旧结果：

| 旧任务 | 状态／完整性 | Snapshot | 结果校验和 |
| --- | --- | --- | --- |
| `873ba8dd-40c3-4f9e-b1d5-b16192f697b0` | succeeded／complete | `0046b0759593d8a66a2a1cb9f78979a3540942801f28e359c46484005a0a39a5` | `a07303d0e7c0f3ce` |
| `652ba051-a4c5-493d-81e6-2cdbe3c090f0` | succeeded／partial | `dbcb682568ebac75acfd5a23c9e968ba0808b097118a45f50453e78c425c558d` | `8c66f3f721f5e4d8` |

完整 API JSON 按键排序后的 SHA-256 更新前后分别保持 `397c4d3eebaaca9528af8ad902946904ab7e6e20c960b861538375e530bfdf28` 和 `0ae85a8c0c77e4e00ba40877db996f20a92b8b54ce0bd7a16b71780cad0acb1a`。这包含旧结果及诊断身份，不以健康状态代替业务记录核验。

## 验证、证据及交接

只读入口实际运行退出 0；最终脚本 `node --check` 与脚本／JSON 的 Prettier 检查通过。正式入口日志及其摘要：

- [消费者更新日志](/private/tmp/thesis-c31-sync-consumers.log)：SHA-256 `543b5d17ac8f315cc11af2c343666cecbf75f7d619b5d21ccd8e0cc7155d5c15`。
- [DSA 更新日志](/private/tmp/thesis-c31-sync-dsa.log)：SHA-256 `ce01358bd5bd136fa53054b51bfd6eba3b3e0712046ff7016ec7e60ef1293b34`。
- [目标输入记录](2026-10-07-research-window-target-c31-input.json)：25 项身份、真实接口汇总、旧任务身份、路由与实际启动命令；没有 Token。

本叶审查通过，更新窗口交还 P5；其 P5.4c 仍由原对话维护。下一叶 C3.2 通过标准准备／创建／读取 API 执行两只股票实际扩展窗口，单独验收费用整窗兜底、未知上市、净收益及持久终态。C3.3 再核对固定 Snapshot 两次离线重放，C3.4 完成真实页面与诊断下载后才关闭父项。

本轮没有创建策略或回测、改写旧 Snapshot、修改数据库结构或提交／推送；未执行 Electron、Mobile、严格 PIT 或不可变镜像发布验收。
