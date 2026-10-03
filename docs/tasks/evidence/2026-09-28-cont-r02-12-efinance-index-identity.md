# R02.12 Efinance 指数目标行唯一性本地证据

## 范围

本叶只调整 DSA `EfinanceFetcher.get_main_indices()` 已有指数代码过滤后的行选择，不变更调用端点、字段转换、单位、来源时点或 Consumer。`R02.12` 父项和真实准入均未完成。

## 失败复现与修复

合成响应中 `000001` 出现两条不同价格，同时 `399001` 恰好一条。修复前运行 `./.venv/bin/pytest -q tests/test_efinance_main_indices.py -k duplicate`，1 failed：返回 `['sh000001', 'sz399001']`，证明重复目标被静默取首行。修复后仅接受恰好一条的目标行，重复的 `000001` 被跳过，唯一的 `399001` 保留。错误代码与缺少代码列均返回 `None`；单行 `code` 回退列保持可用。

## 验证与边界

- DSA `./.venv/bin/pytest -q tests/test_efinance_main_indices.py`：5 passed、2 条第三方弃用 warning。
- DSA 合并运行该文件、`test_efinance_realtime_quote.py`、`test_sina_index_identity.py`、`test_tushare_index_daily_rows.py`：32 passed、2 条同类 warning。
- DSA 新增测试文件 flake8、两个改动文件 `py_compile`、`git diff --check` 均通过。
- DSA 生产文件全文件 flake8 仍失败，报告既有未使用导入、空白及 f-string 告警；本叶未改这些位置，也未将此报告当作通过。

全程仅用合成 DataFrame，未调用真实 Efinance、HiThink 或其他 Provider。Efinance 实际上游、EastMoney 同源关系、价格/量额单位、时点、覆盖、权限和 P02/G0-M 仍未验证。原 DSA 官方离线全包的 16 failed 历史结果未改变；不执行第三次同前提重试，也不更新目标 Docker。
