# CONT-M26 URL 主机名证据

## 范围与结论

DSA 的 Tushare 基金身份解析器使用 `urlsplit`，此前会接受 `https://%/doc`、`https://%GG.test/doc`、`https://\ud800.test/doc` 及百分号解码后包含 `/` 的主机名。两类证据角色均受影响；生产事件入口会在原文检查后继续进入策略、目录和账号路径。现仅在既有 `_document` 检查中核对主机名的百分号编码、严格 UTF-8 解码、非法主机字符和 IDNA 编码；URL、原证据 bytes、摘要及既有 authority 反斜杠检查均不改写。

## 合成反例与验证

除注明主仓的命令外，均在 DSA 工作区执行。生产入口使用临时 SQLite、合成身份及 HMAC、mock 来源，无真实账号或网络请求。

| 阶段 | 检查 | 实际结果 |
| --- | --- | --- |
| 修复前纯解析器及生产入口 | `rtk proxy .venv/bin/python -m pytest -q tests/test_tushare_fund_identity_evidence.py tests/test_thesis_ledger_tushare_events_v3.py -k 'document_invalid_host' --tb=short` | 14 选中，14 失败：纯解析器 8 例未抛异常，生产入口 6 例未抛 `not_admitted`；证明错误放行 |
| 主仓现有 Schemas `dist` | 从 `packages/schemas/dist/market-tushare-identity-v3.js` 调用 `marketTushareFundIdentityV3Schema.safeParse`，替换合成 fixture 的 `identityEvidence.documentUrl` | `%`、`%GG`、代理项、`%2f` 四类均为 `false`；合法 `%65xample.test` 为 `true`；未重建或修改 `dist` |
| 修复后定向验证 | `rtk proxy .venv/bin/python -m pytest -q tests/test_tushare_fund_identity_evidence.py tests/test_thesis_ledger_tushare_events_v3.py --tb=short` | 217 通过，3 条依赖/收集警告；两证据角色的畸形 host 均拒绝，生产入口在 policy/catalog、环境凭据、Control 解密、adapter、来源前的 spy 均零调用；正常 Unicode 路径、有效百分号主机名及既有 authority 反斜杠回归通过 |
| 限定质量检查 | 三个 DSA 写入文件的 `flake8 --count --select=E9,F63,F7,F82 --show-source --statistics`、`py_compile`、尾随空白搜索，以及 DSA `git diff --check` | flake8 为 0，编译通过，无尾随空白，diff 空白检查通过 |

修复前失败仅用于反例，修复后首次验证通过，本叶重试预算未消耗。此前 DSA 官方全包已有两轮失败，本叶未第三次运行；Docker、目标运行态、真实 Provider 和业务验收均未执行，M26 父项仍开放。

## 输入 SHA-256

| 输入文件 | SHA-256 |
| --- | --- |
| `daily-stock-analysis/src/services/tushare_fund_identity_evidence.py` | `cb2cf58b903eac4d7a4c03144f387e844c783c806b0e288d37c30a2dd7c7adb5` |
| `daily-stock-analysis/tests/test_tushare_fund_identity_evidence.py` | `6102bfe7406f3f0ed5eb37563bd797140eb849f052823fef50dd967145b93a39` |
| `daily-stock-analysis/tests/test_thesis_ledger_tushare_events_v3.py` | `bd5b7c64bb935c1cac652a6b9fd631a79774ef5cae0756af755a99cb0b7b2da8` |
| `thesis-ledger/packages/schemas/src/market-tushare-identity-v3.ts` | `6a0c4c806098e2bf446fb80ba7cd0960829a8d9777476e805ecd5e2df662ca6f` |
| `thesis-ledger/packages/schemas/dist/market-tushare-identity-v3.js` | `e45899f2dfbcb90caf20b161c927b81d33dfa78cdbff9b4363318cfaf12ada5a` |

三个 DSA 文件原为未跟踪 WIP；本叶未暂存、提交或覆盖其他改动。所有本叶测试与检查进程均已结束，写权交还协调者。回退范围仅为本叶主机名校验及新增反例，须保留上一叶 authority 修复和其他并行 WIP。
