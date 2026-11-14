# 港美股后复权回测失败诊断与验证

## 已核实的失败

2026-11-11（北京时间）：

| 时间 | 任务 | 标的 | 结果 |
| --- | --- | --- | --- |
| 17:04:30 | `6872cec3-34ce-4a57-984f-02e79092027e` | `AAPL.US` | `PREPARATION_FAILED`，未启动执行 |
| 17:05:05 | `95d46ed6-bb3f-4a24-aebf-07ddd3169b7f` | `00700.HK` | `PREPARATION_FAILED`，未启动执行 |

两者均请求 `hfq`，执行及预热窗口为 2025-10-18 至 2026-11-11。数据库诊断仅保留“执行行情来源当前不可用”；DSA 同时段日志确认 `/market/bars` 返回 HTTP 422。策略修订 198 已应用，两个精确路由均只有 `futu/futu`，目录为 `ready`、有效目标为 `eligible=true`。

只读运行态模块检查确认：两标的的真实多市场日历可覆盖请求窗口，但 `_research_request` 均为 False，覆盖上下文为 None。富途绑定仅为港美股股票 `qfq` 接上研究日历及身份策略，`hfq` 缺失；API 因此在 Provider 调用之前拒绝。该证据不证明富途账号权限可用。

## 诊断工具修复

原诊断脚本硬编码中国市场，苹果首次诊断在请求解析阶段失败、未访问上游。改为复用生产市场解析后，两标的均到达覆盖门禁，并在未取数时返回覆盖不足。旧 `listing_fact_missing` 仅由脚本根据缺少上市事实猜测，不能据此断言根因是上市日缺失；生产研究本允许未知上市日并明确标记。

DSA 执行 `.venv/bin/python -m pytest -q tests/test_backtest_daily_source_probe.py`：17 通过。新增两项测试首轮因测试凭据封装不匹配失败，改为实际 `opend/values` 合同后通过。隔离诊断均返回 `productionControlUnchanged=true`，未重跑或修改原失败任务。

## 实施及本地验证

DSA 为港美股股票 `hfq` 绑定既有研究日历及来源身份策略，并将公共身份入口的来源策略分支扩展到 `hfq`；回退身份路径继续维持原边界。已有观察时间、复合身份摘要、证券与市场校验保持生效。诊断脚本默认窗口仍为 93 天，仅显式 `--max-window-days 400` 可复核含预热的年度窗口，不增加请求和超时预算。

Server 在读取来源失败时保留已校验的 `insufficient-coverage`，投影为现有 `missing_window`；其他取数错误保持 `fetch_failed`。回测说明改为“执行行情或覆盖证明未完整覆盖依赖计划要求的同一窗口”。依赖方向保持 Market 消费 Integration，新增 helper 拥有错误分类，不增加大文件职责；`check-boundaries.mjs` 既有规则适用，无新增非法依赖模式。

| 检查 | 命令及范围 | 结果 |
| --- | --- | --- |
| DSA 定向 | `.venv/bin/python -m pytest -q tests/test_futu_research_identity.py tests/test_backtest_daily_source_probe.py tests/test_thesis_ledger_futu_capability_path.py tests/test_futu_daily.py tests/test_thesis_ledger_research_calendar.py tests/test_thesis_ledger_research_instrument_binding.py` | 178 通过；此后诊断脚本增加显式年度窗口及一项 CLI 测试，该文件单独复核 18 通过，共覆盖 179 个独立用例 |
| DSA 门禁 | `.venv/bin/python scripts/check_thesis_ledger_capability_boundaries.py`、`scripts/check_data_runtime_contract.py`、`scripts/data_test_scope.py` | 通过；登记 434 个测试目标 |
| Python 静态检查 | 修改的五份 Python 文件执行 `py_compile` 与 `flake8 --select=E9,F63,F7,F82 --show-source --statistics` | 均退出 0 |
| Server 定向 | `pnpm --filter @thesis-ledger/server test test/market/market-window-read-error-v3.test.ts test/market/market-window-selector-v3.test.ts test/backtest/backtest-preflight-v3-execution.test.ts test/backtest/backtest-run-preparation.test.ts` | 72 通过 |
| Server 类型及构建 | `pnpm --filter @thesis-ledger/server typecheck`、`build` | 均退出 0；正式快更再次构建 Server 与三个 workspace 包 |
| 仓库门禁 | `pnpm exec node scripts/check-boundaries.mjs`、`scripts/check-file-size-guardrails.mjs` | 通过；规模检查报告六个既有大文件警告，未提供基线，不将该检查扩大为全工作区规模无增长证明 |
| 差异卫生 | 两仓 `git diff --check`；新增 TS 文件 `prettier --check` | 最终通过 |

回归测试首轮还发现公共身份入口只接受 `none/qfq`，补齐来源策略分支后 178 项通过。新增 Server 测试首轮使用非合同错误文案，被严格解析正确拒绝；改为共享合同中的实际错误文案后 72 项通过。未放宽错误信封校验。

## 运行态更新与独立验收

从 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行 `./scripts/sync-code.sh all`，无额外参数，兼容性预检通过，退出 0。DSA、Server、Worker 均健康；数据库结构与外部卷未变。该结果是容器可写层快更，镜像保持原 ID，不是镜像发布。

独立 SHA-256 核对宿主与容器：

- DSA `data_provider/thesis_ledger_sources/futu.py`：`edfe581b83305d22fb4d7b538666877033f74b8d38b01ecc270a3cdd4358f6fa`。
- DSA `src/services/thesis_ledger_reference_identity.py`：`5f3bf44f47241119e01147bd2095271facf61cc433478ccedd33ba08c74ae7a1`。
- Server `market-window-read-error-v3.js`：`e0e03e15177dbed4ac36e19373e0e9f4dcb4805fabf06ec8193e27e9de7dc302`。
- Server `market-window-selector-v3.js`：`2cfdce89c04c0b5a06114e7744ef6a7c24a5923a7f6108d74d5c4fa5a4ecb139`。
- Server `backtest-preflight-v3-execution.js`：`a9c182a61faeee1762b3cf250c244d37e19d1fb57573e9582114342705976b2a`。

Worker 中上述三个编译文件的摘要也分别与宿主一致。

真实诊断由 DSA 受维护入口 `./scripts/local-runtime/probe-backtest-daily-sources.sh` 执行，参数为 `--symbol <代码> --asset STOCK --adjustment hfq --start <起日> --end <止日> --target futu/futu`，年度窗口额外提供 `--max-window-days 400`。两个标的先各验证一个小窗口，再各验证原任务窗口：

| 标的 | 窗口 | 实际／预期交易日 | 缺日假设 | 输入摘要 |
| --- | --- | --- | --- | --- |
| `AAPL.US` | 2026-10-01～2026-11-10 | 29／29 | 无 | `f82b26bca7220fef45a885ec8d55e4c23cbbe09dc6b9e9cc891b550c4d66bc86` |
| `00700.HK` | 2026-10-01～2026-11-10 | 27／27 | 无 | `7f71316f1080abf94a9ce0427ffbdba59e56ef74ca9d417b39e7b2b5e065d8b5` |
| `AAPL.US` | 2025-10-18～2026-11-11 | 267／268 | 11 月 11 日尚未开市，保留既有研究缺日假设；真实数据止于 11 月 10 日 | `3c3f3a5a2406a1d05e3447fcb31197602cd4e80191665a39bbdcd7d42a642ed2` |
| `00700.HK` | 2025-10-18～2026-11-11 | 262／262 | 无 | `0a59a0379261890093676d3cfe6e5ec6475818575fc1ea032459126c13427fb1` |

四次均为 `validated`、`pagesFetched=1`、`productionControlUnchanged=true`；共四次实际行情窗口读取，修复前诊断均停在取数前。字段单位与上市日期仍为未知，没有将研究价格读数认证为真实原始份额执行事实。

最终只读核对策略仍为修订 198、`applied`；两条原始失败任务的状态、错误码与结束时间保持原值。本轮没有创建或重跑回测任务，因此证明的是后复权准备阻塞修复和真实行情窗口，不是新回测已成功完成；没有修改前端结构或样式，也未声明浏览器验收。

## 最终核对

本次写集和工作区原有大量未提交差异分开核对；未提交、推送或发布。当前规格覆盖 AC1～AC4，任务及证据链接已核对，任务归档于[实施任务](../archive/tasks/2026-11-11-overseas-hfq-backtest.md)。

本轮未执行全仓离线测试或新回测终态验收；定向覆盖获取、身份可见时钟、拒绝与隔离清理，真实窗口覆盖当前账号读取。本地快更在容器重建后消失；回退时仅恢复本轮绑定、身份入口及错误 helper 的原补丁，再由正式 `sync-code.sh all` 应用，不修改控制数据或数据库。DSA 已更新专题设计和 `docs/CHANGELOG.md`；该中文专题没有成对英文页。
