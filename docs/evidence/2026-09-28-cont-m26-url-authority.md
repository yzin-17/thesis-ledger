# CONT-M26 URL authority 证据

## 范围与结论

DSA 的 Tushare 基金身份原文解析器原先允许 `https://identity.example.test\other/doc`：`urlsplit` 将反斜杠保留在 `netloc`，却不使 `hostname` 检查失败。主仓 `market-tushare-identity-v3` 源码与现有 `dist` 明确拒绝 authority 中的反斜杠。现仅在 `_document` 检查 `parsed.netloc` 是否含 `\`，两个证据角色共用此检查；未修改 URL 原文、摘要、JSON 原字节或其他 URL 设计。正常 Unicode 路径和路径/查询中的反斜杠仍通过纯解析器。

## 反例与验证

全部命令在 DSA 工作区执行，除注明主仓者外；只用合成身份、合成 HMAC、临时 SQLite 和 mock 来源，无真实账号或网络请求。

| 阶段 | 命令或检查 | 实际结果 |
| --- | --- | --- |
| 修复前纯解析器 | `rtk proxy .venv/bin/python -m pytest -q tests/test_tushare_fund_identity_evidence.py -k 'document_authority_backslash or document_path_and_query'` | 4 选中；authority 两角色 2 失败（未抛异常），Unicode/path/query 对照 2 通过 |
| 修复前生产入口 | `rtk proxy .venv/bin/python -m pytest -q tests/test_thesis_ledger_tushare_events_v3.py -k document_authority_backslash` | 2 失败（未抛 `not_admitted`） |
| 修复后纯解析器 | `rtk proxy .venv/bin/python -m pytest -q tests/test_tushare_fund_identity_evidence.py` | 159 通过 |
| 修复后生产入口 | `rtk proxy .venv/bin/python -m pytest -q tests/test_thesis_ledger_tushare_events_v3.py` | 43 通过；非法引用在 policy/catalog、环境凭据 snapshot、Control 解密、adapter 和来源调用前收敛为 `not_admitted`，各 spy 零调用 |
| 主仓现有构建产物 | 从主仓 `packages/schemas/dist/index.js` 调用 `marketTushareFundIdentityV3Schema.safeParse`，分别替换两个证据角色的 authority URL | `identityEvidence false`、`dividendCurrencyEvidence false`；未重建 `dist` |
| 限定质量检查 | `rtk proxy .venv/bin/python -m flake8` 对三个 DSA 写入文件执行 `--count --select=E9,F63,F7,F82 --show-source --statistics`；`rtk proxy .venv/bin/python -m py_compile` 对同三文件；`rtk git diff --check` | flake8 为 0；编译与空白检查通过 |

以上确定性失败只用于修复前反例，修复后首次验证通过；本叶重试预算未消耗。此前 DSA 官方全包已有两轮失败，本叶未第三次运行全包，也未执行 Docker、部署或真实 Provider 验收，不能据本叶将历史全包或 M26 总验收标为通过。

## 输入 SHA-256

| 输入文件 | SHA-256 |
| --- | --- |
| `daily-stock-analysis/src/services/tushare_fund_identity_evidence.py` | `8d80f93ae27d131d3c59db3932d14655004b00ff00bee587b53f8125fb572a58` |
| `daily-stock-analysis/tests/test_tushare_fund_identity_evidence.py` | `1ad13638842b49f3d1eb37fbd741f8adc93ac001125a48dbabfbc930a5b1c3fd` |
| `daily-stock-analysis/tests/test_thesis_ledger_tushare_events_v3.py` | `714bfe6cc73e13877f6ca56a3af2a1dbc9f14a1d03d4133fc4b2b39c195d42f4` |
| `thesis-ledger/packages/schemas/src/market-tushare-identity-v3.ts` | `6a0c4c806098e2bf446fb80ba7cd0960829a8d9777476e805ecd5e2df662ca6f` |
| `thesis-ledger/packages/schemas/dist/market-tushare-identity-v3.js` | `e45899f2dfbcb90caf20b161c927b81d33dfa78cdbff9b4363318cfaf12ada5a` |

只读检查和上述三个 DSA 文件、此证据文件以外没有本叶写入；未暂存或提交。回退范围是 `_document` 的 authority 判断及本叶新增反例，须保留其他并行 WIP。
