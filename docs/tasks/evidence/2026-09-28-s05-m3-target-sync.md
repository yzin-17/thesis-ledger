# S05 M3 目标运行态同步证据

状态：`worker_done`。执行叶：`S05-m3-target-sync-0928`。仅证明当前目标运行态与本批源码同步及受控纯函数 smoke；S05、M3 业务资格与最终验收继续由父任务判断。

## 输入与入口选择

前置门禁文件 `2026-09-28-s05-precision-regression-gates.md` 本轮实读 SHA-256 为 `beb52ccf620e9dbc060a500fe9e3deb0ff324f3fc01f781acc49cd7c8fccfaa0`。复用父任务已验证的定向测试、包级构建及仓库门禁，不重复全量测试。

实际阅读 infra `scripts/sync-code.sh`、`scripts/update.sh` 和相关规则。三个目标均 running，官方 sync 在变更容器前检查 Compose 镜像引用、Server 与 domain/schemas/shared package manifest、完整 Prisma 目录及 DSA requirements 一致性；本次预检通过。选择最小目标 `all`，因为 DSA 与 ThesisLedger 应用代码均有改动。未调用 update；未运行开发数据库重建。

三仓非 docs 的 tracked/untracked、非 ignored 文件基线分别为 ThesisLedger 1466、DSA 1168、infra 24 个；初始脏项分别为 539、160、11。同步后这些原有输入 SHA 全部未漂移。保留所有脏 WIP，未 reset、stage、commit、clean，也未修改源码、配置、manifest、migration、SSOT、Task 或 Spec。官方入口生成宿主构建产物属于本次执行的授权产物。

## 执行与镜像

UTC 开始 `2026-09-27T19:54:45Z`，完成 `2026-09-27T19:56:18Z`，退出码 0。infra cwd 下执行：

```sh
rtk proxy sh -c 'date -u +%FT%TZ > /private/tmp/s05-m3-target-sync-0928/start; ./scripts/sync-code.sh all > /private/tmp/s05-m3-target-sync-0928/sync.log 2>&1; result=$?; printf "%s\\n" "$result" > /private/tmp/s05-m3-target-sync-0928/sync.exit; date -u +%FT%TZ > /private/tmp/s05-m3-target-sync-0928/end; exit "$result"'
```

官方脚本自动执行 `pnpm --filter @thesis-ledger/server... build` 和 DSA Web `npm run build -- --logLevel warn`；复用已就绪 DSA Web 依赖。随后同步 DSA、Server、Worker 并重启。入口内预检、构建、同步、重启与镜像核验全部通过。

| 目标 | 同步前后镜像 ID | 最终状态 |
| --- | --- | --- |
| DSA | `sha256:a9afed6adcadff81b776132790a743db90c422a1bc97fb96697ab32e47ca7b20` | running / healthy |
| Server | `sha256:f51e7f52e3ce141fa29517afae0005ff9c9c19d12009b0a6d8b3f4539ea49b7a` | running / healthy |
| Worker | `sha256:f51e7f52e3ce141fa29517afae0005ff9c9c19d12009b0a6d8b3f4539ea49b7a` | running / healthy |

同步仅更新容器可写层，容器重建后消失，不是镜像更新或生产发布证据。

## 运行态受控验证

临时脚本均通过 native `apply_patch` 创建于独占目录 `/private/tmp/s05-m3-target-sync-0928`：`server-smoke.cjs`、`dsa-smoke.py`、`prepare-fixture.cjs`。V2 payload 从现有 `packages/schemas/test/market-pit-reconstruction-v3.test.ts` 的 fixture 与 v2Fixture 只提取函数，经现有 TypeScript 转译为纯 JS；不 import Vitest，不触发业务连接。生成 `proof.json` 为 synthetic 结构夹具。

```sh
rtk proxy node /private/tmp/s05-m3-target-sync-0928/prepare-fixture.cjs
```

使用 Python subprocess 的精确 argv 向 Server/Worker 传入脚本内容与 stdin payload，不向容器写入脚本：

```python
subprocess.run(['docker', 'exec', '-i', 'thesis-ledger-dev-' + role + '-1', 'node', '-e', server_script], input=proof_json, text=True, capture_output=True)
subprocess.run(['docker', 'exec', '-i', 'thesis-ledger-dev-dsa-1', 'python', '-'], input=dsa_script, text=True, capture_output=True)
```

Server 与 Worker 各 **16 项通过**，Node `v24.20.0`。实际加载 `/app/apps/server/dist/src` 编译模块及 `/app/node_modules/@thesis-ledger/schemas/dist/index.js` 公共导出，覆盖：微秒独立排序、等价 offset 与小数尾零、未知 offset 拒绝；source-times 正例双 Bar 绑定、F01 晚一微秒拒绝、抓取早于观察拒绝、未知 offset 拒绝；strict V3 point-in-time 抛 `DATA_UNAVAILABLE` 且消息含 `historicalDecisionWindow`，fixed 路径通过；comparable-data、execution-evidence、completeness-checks、pit-guard 四 helper export；V2 schema 正例、未知 offset 与一微秒越过首决策截点拒绝。均为纯 synthetic 验证，不授予历史事实资格。

两端另执行 `rtk proxy docker exec <目标> node -e 'const s=require("@thesis-ledger/schemas"); console.log(JSON.stringify({publicInstant:typeof s.parseMarketPitEvidenceInstantV1,publicV2:typeof s.marketPitReconstructionProofV2Schema.safeParse}))'`，公共包名解析与两个导出均为 `function`。

DSA **6 项通过**：Sina 完整精确代码选择、错误市场拒绝、重复身份拒绝；Tushare 乱序选择最大日期、错误完整代码拒绝、重复日期拒绝。只调用两新 Pandas helper，不调用 Fetcher 或真实网络。运行态 Python `3.11.16`，pandas `3.0.6`、akshare `1.18.97`、tushare `1.4.29`、baostock `0.9.4`，均只读版本未安装依赖。

## 源码与编译产物摘要

以下源 SHA 对应宿主 TypeScript 原文；编译 SHA 分别读取宿主 dist、Server 和 Worker，对 **12 项逐项相等**，不混淆源文与编译文。Server 编译路径为 `/app/apps/server/dist/src/<文件>`；schemas 为 `/app/node_modules/@thesis-ledger/schemas/dist/<文件>`。核验命令为容器 `sha256sum` 和宿主 `hashlib.sha256(read_bytes())`。

| 文件 | 原文 SHA-256 | 宿主 / Server / Worker 编译 SHA-256（三方相等） |
| --- | --- | --- |
| `market/market-pit-evidence-instant-v1.js` | `b569495a1dc95419b25d3b7744e1e8fda68fa18b281a46393b36b11fd79061bd` | `ecba2360d85bb0bddd9152cb9f5584ba440ef087d136e634cb262d29c605a676` |
| `market/market-pit-reconstruction-source-times-v3.js` | `6d7d899f8f6c8ad92c7e066ef0f20c107340ed3e930f25480f12c4dfc495a61a` | `a7bd77ad420d6fc5bae7c966c91a03a0795401ef698b590d1dd6e87eccc202e3` |
| `backtest/backtest-snapshot-v3-pit-guard.js` | `0c6237f00fe7a68ccd4146700a4c2e3a4684ba716d6ace4d5f069dd098b71f3e` | `bb940f925844eefbc686f9bda6a62ac271edb2d78988b2252a488ade16394461` |
| `backtest/backtest-snapshot-v3-comparable-data.js` | `6a141184de532babe4eb58884e73e30dcbc06aae90688e7eb3b106d191341213` | `f67d6925534fe433f3d937c810c90210823c9f0e21d02a5d99909062f5f17e10` |
| `backtest/backtest-snapshot-v3-execution-evidence.js` | `2af794bd46b5f033f392f6e1bf52156cd0c2d92f90bb276b17b22fc79217d1ae` | `702a6073dabd94bb53b45b8ca44b43fd93b66d43c33da0e84a8e5fc994bda2ff` |
| `backtest/backtest-snapshot-v3-completeness-checks.js` | `719f8c0069569a4593dea3aa8934eca08f436b7106637d8446d2449c0f3a080e` | `67595d81296aa360e89ab1d9fbac1dd62bc52eae5d9eada100326ff8d3af0867` |
| `backtest/backtest-snapshot-v3-builder.js` | `5880fccabc621cc81e5b6d0476f67034dde05c3b1fd51a93a61603cd8b0296c5` | `be65f7a727a733059dd832c46dfdbb80cdbf60a97800b22f2364e0735521a6d3` |
| `backtest/backtest-snapshot-builder.js` | `7ac6d0fcc4e049ca109711f04248ba71039cee809c95ef0dc7fb0775700414e2` | `f46990fc09d4d81ffacbfc4ec6a555eb12c97a7831c2bec99b90c43d1c3adb91` |
| `schemas/index.js` | `744954bc76ed07c26f4abd368ea4f71468dcd900af1690ba4e5a56fcf31471ff` | `53a1df5006f2e53c9b91bebcbcb881e095363c5c26cae8ce9a5944fb78e1bfdd` |
| `schemas/market-pit-evidence-instant-v1.js` | `7faf533fb71291ebbed1945e4d51d9e73a2cc5103b78e404b6eb9efeb360b552` | `61c5c92d4ee723368011d405779ee9fcf0aec7f22f36f10d01a6f6f8bf157efc` |
| `schemas/market-pit-reconstruction-v3.js` | `cb16e874fa5f207a1b046c20f213037fcdc001b187da3290f6dae4e4a4d1f01f` | `73463ca3fb1d2345c69bd8b5e21e5dc1bf715198278e96de7b0d8c9ba83e893e` |
| `schemas/market-pit-historical-evidence-v1.js` | `ad61c28930ae4b5275a2e3e2d21f7870f9f0986afc23a589f6320a560c3d87a8` | `1b9871c8554130b6b8a13c4bb301d8ae1c36d63d2e038625aab47daa47d54cb2` |

DSA 六文件原文 SHA 与运行容器 `/app/data_provider/<文件>` 逐项相等：

| 文件 | 宿主 / DSA SHA-256 |
| --- | --- |
| `akshare_fetcher.py` | `abb60ee7c54661f53e81babf6186bf183aa5aae4d455e3e8d5c820cc09da566c` |
| `tushare_fetcher.py` | `fe0d7c99e91433571d1bbd496c734511854e8e399db3d89497f8a107a746919f` |
| `baostock_fetcher.py` | `5d8ba1697cd9cb8f1bbdfe814151aa0617fd61d9ef21e3736da4cfb20246040b` |
| `efinance_fetcher.py` | `d91327c2ff55bdd2fc9b284c8a0c4126a971d0ed3b2caa8dcef0bc49df572a5d` |
| `sina_index_identity.py` | `c65f98eb974c98d7b3c364ff8193aa3e9cd8e0f45fca33cfdc5b3c21ad6204ed` |
| `tushare_index_daily_rows.py` | `25f13b0abaa406b53c7ba8ff47e18022dbf300a5240ebecf7ea2d1fcd0f3dacc` |

## 固定窗口日志与边界

窗口 UTC `2026-09-27T19:56:18Z` 至 `2026-09-27T20:00:35Z`；通过 `docker logs --since <开始> --until <完成> <目标>` 只在进程内统计，不持久化或输出原始日志。missing-table 使用 `does not exist|no such table|P2021|undefined_table`，fatal、error/exception/traceback、DATA_UNAVAILABLE 独立计数。

| 目标 | 日志行数 | 缺表匹配 | fatal | error/exception/traceback | DATA_UNAVAILABLE |
| --- | --- | --- | --- | --- | --- |
| dsa | 125 | 0 | 0 | 0 | 0 |
| thesis-ledger | 50 | 0 | 0 | 0 | 0 |
| backtest-worker | 0 | 0 | 0 | 0 | 0 |

健康与日志摘要只证明观察窗口状态，不代替数据库业务结构门禁。未发送 Provider/API HTTP 请求、未访问 Reader DB、未执行原始 SQL、I01、Worker 业务 job、AI、浏览器或 Electron；未更改 Provider 配置，旧 HiThink/BaoStock/Catalog/AI/I01 预算未 reset。

## 失败记录与收尾

临时 fixture 转译脚本首次指向不存在的 Server 局部 TypeScript；实际查明根 node_modules 已有 TypeScript 后更正，无安装或源码改动。首次 Server/Worker smoke 的绝对 require 指向 package 目录与错误 `/app/dist` 路径，模块加载失败；按实际同步脚本确认运行路径并更正独占 smoke 脚本，再执行两端各 16 项通过。这两类失败均属验证脚本定位错误，未修改应用实现或容器。未发生官方 sync 失败、部分同步或非官方修复。

sync 前后非 docs 输入 SHA 未漂移；没有后台验证进程或写入中的任务。官方入口负责清理 staging，临时目录保留可复查 smoke 与脱敏结果，运行态资源与写权交还父任务。证据失效条件：相关源码/compiled dist、manifest、migration、runtime package 或目标容器变更；本结果不关闭最终历史窗口、离线封存、真实业务消费或整体资格门禁。
