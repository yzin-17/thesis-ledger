# E01-N2.3.2.2.1 净值研究规则生产验收

## 范围与结论

2026-09-30，规则生产子叶完成。原 N2.3.2.2 拆为规则与日期两个子叶；本证据只关闭规则子叶，完整基金估值、申赎处理、披露工作日集合及暂停完整性由 N2.3.2.2.2 验收，父任务保持未勾选。

DSA 新增 `src/services/thesis_ledger_nav_rules.py`、`data_provider/efunds_nav_disclosure.py` 与 `tests/test_thesis_ledger_nav_rules.py`。本轮未改变 Policy、Admission、公开 API、Run 创建、数据库或目标部署。

## 生产合同

- 普通基金通过 `build_domestic_nav_rule` 消费显式 `nav-research-default-v1` 配置：标的、`fundType=domestic`、T+1、适用范围、配置时刻及用户研究决策缺一不可。`research-config://` 引用和原配置 UTF-8 字节摘要绑定该研究假设，不冒充基金官方披露文件。配置时刻与实际采集时刻分别保存。
- 普通基金身份是调用方声明，精确生产接口必须另行核验身份；规则工厂不按代码或名称猜测类型。已核查 QDII 拒绝普通默认；未知 QDII 不生成规则。
- `read_qdii_nav_rule` 仅支持经过基金级核查的 110011.OF、118001.OF。生成前重新获取对应官方 PDF，要求 HTTPS、TLS 验证、原地址无重定向、状态 200、PDF 标识及 SHA-256 与审查记录一致。连接/读取超时为 5/10 秒，截止检查预算 30 秒、最大 8 MiB，不内部重试；底层阻塞读取仍受读取超时约束。
- 规则包含现行合同的版本、标的、基金类型、请求适用范围、披露延迟、依据、证据引用、文档摘要及真实配置时刻。不可变证据包同时返回规则原文、文档原字节、真实采集时刻与 Reader 修订；读取 `rule` 返回新对象及规则原文摘要，外部修改不能污染包。
- 审查范围分别为 110011 的 2026-07-01 至 2026-09-30、118001 的 2026-07-27 至 2026-09-30。这是本次生产器的可用范围限制，不声明法律有效期、不证明最新全部版本，也不外推至基金成立以来。请求超出范围、原文变化、配置/采集晚于 `dataAsOf` 均拒绝。
- `ruleRaw` 是生产的规则记录原文；`document_raw` 才是对应原配置或官方 PDF 字节，两者各自摘要不得互换。当前下载时间不代表历史净值发布时间，研究规则不授予严格 PIT 资格。

## 真实来源与交叉校验

使用未修改的生产规则目录及生产 HTTP Reader 首次读取，无重试。官方来源为 [110011 招募说明书](https://cdn.efunds.com.cn/owch/data/bulletin/20260701/易方达优质精选混合型证券投资基金更新的招募说明书.pdf) 与 [118001 招募说明书](https://cdn.efunds.com.cn/owch/data/bulletin/20260727/易方达亚洲精选股票型证券投资基金更新的招募说明书.pdf)。已核查净值披露延迟分别为 T+1、T+2 工作日。

| 标的 | 延迟 | PDF 字节数 | 原文 SHA-256 | UTC 实际采集时刻 |
| --- | --- | --- | --- | --- |
| 110011.OF | 1 | 1318373 | `bc6940d7f3209ff05571e20727200d69ca78ffce593d6a6921fb0ec521c4f1c4` | `2026-09-30T15:25:04.402624+00:00` |
| 118001.OF | 2 | 1303753 | `2c0ac2a0eb177f9966a7dd254e2bdf29c269654baf9c489928898068594d068b` | `2026-09-30T15:25:04.870010+00:00` |

探针明确设置 `dataAsOf=2026-09-30T23:59:59.999999+08:00`。两条规则的 `configuredAt` 等于各自本次文档采集时刻；规则原文摘要分别为 `62ae115631e901dff0dde11d877bca669da69c38a4f73847ce4a00800af8561d`、`15179513be682587b5e8109b02dfd58afc8678f9666e6ccaeda41c745acaac19`。

另用受控 161725.OF 普通配置验证显式研究默认，配置时刻为 `2026-09-30T14:00:00Z`，实际采集为 `2026-09-30T15:25:03.938692+00:00`。该样本只验证声明配置路径，不作为基金身份来源验收。配置原文摘要为 `6ccf6fc05ad6771b4c9d5ef9c984d6c04251c8276796635baff90eac8e28757e`，规则原文摘要为 `9a1abbd00ff874d7516305fc9f1a2f32f4d4d7db6107e3592a6506b5a72a0d40`。

三条生产结果均通过主仓现行 Schema、实际 Server `validateNavResearchRule` 的规则投影校验及独立原文摘要重算；篡改规则原文、非法延迟拒绝。该检查验证规则字段与原文关联，不代表完整 Snapshot、Run 或部署验收。

探针命令：

```sh
rtk proxy node /private/tmp/e01-nav-rule-schema-probe.mjs /Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis /Users/yzin/code/thesis-ledger-workspace/thesis-ledger/packages/schemas/dist/index.js /private/tmp/e01-nav-rule-live-probe.py /Users/yzin/code/thesis-ledger-workspace/thesis-ledger/apps/server/dist/src/backtest/backtest-nav-visibility.js
```

临时探针用于记录此次执行，长期复验入口是生产函数与仓库测试。PDF 原字节由证据包返回；本轮未把二进制文档写入 Git。

## 本地验证

- 新增规则测试 46 项通过：显式普通默认、两种 QDII 延迟、原文与摘要不可变、未知基金/类型/范围、重复字段、非法时间及精度、未来配置/采集、PDF 改动/缺失、TLS、重定向、大小与截止预算、时区等价等正负例。
- 与原文 Reader、日期、路由、ProviderRuntime、合同、目标绑定及消费边界共 10 文件回归：179 项通过，4 条警告，耗时 2.01 秒。
- 三个新增 Python 文件完整 flake8 与 Python 编译通过；主仓 `scripts/check-boundaries.mjs` 通过。没有新增依赖，未重复构建生产镜像。

回归命令（DSA 根目录）：

```sh
rtk proxy .venv/bin/python -B -m pytest tests/test_thesis_ledger_nav_rules.py tests/test_eastmoney_fund_nav.py tests/test_eastmoney_nav_evidence.py tests/test_thesis_ledger_nav_dates.py tests/test_thesis_ledger_current_data_route.py tests/test_thesis_ledger_provider_runtime.py tests/test_thesis_ledger_contract.py tests/test_thesis_ledger_data_v3_target_pins.py tests/test_efinance_realtime_quote.py tests/test_thesis_ledger_consumer_boundary.py -p no:cacheprovider -q --tb=short --disable-warnings
rtk proxy .venv/bin/python -B -m flake8 data_provider/efunds_nav_disclosure.py src/services/thesis_ledger_nav_rules.py tests/test_thesis_ledger_nav_rules.py
rtk proxy .venv/bin/python -X pycache_prefix=/private/tmp/e01-nav-source-pycache -m py_compile data_provider/efunds_nav_disclosure.py src/services/thesis_ledger_nav_rules.py tests/test_thesis_ledger_nav_rules.py
```

源码摘要：`efunds_nav_disclosure.py` 为 `90cc00b8f2cc1848190a43f9b6c0b44c8103df3a5e5d9dcbfc882263063b97cc`；`thesis_ledger_nav_rules.py` 为 `2710c74bf16844516c44840c2c4d05c36a7a9659d1f39fce0a2d42a597cc24b5`。

## 下一叶边界

N2.3.2.2.2 仍需取得独立完整基金日期及暂停证据，或先明确获准的研究日历合同。已有沪深日历发布证据只能支持披露工作日；不能直接把基金估值、申赎处理日期都当作沪深交易日，也不能从净值返回日期反推完整集合。方向性暂停、非交易日估值及尾部预算继续保留验收义务。
