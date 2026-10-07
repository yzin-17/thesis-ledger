# 停用公司行动适配链清理

## 调用与变更

在当前三仓未提交工作区中反查 DSA 生产代码：`real_corporate_actions()` 无调用方；其唯一后继 `AkshareFundamentalAdapter.get_corporate_actions_v2()` 也只由该函数和旧入口测试调用。现行公司行动读取经独立 Event V3 来源、准入和冻结消费链路处理。本叶删除这条停用的 V2 helper、适配方法、两项仅服务旧方法的标准化器及对应测试；保留 AkShare 适配器仍用于财务分析的分红摘要能力，也保留旧公司行动 URL 返回 404 的反例测试。

## 验证

- 调用反查：`rg 'real_corporate_actions|get_corporate_actions_v2|normalize_(etf_)?corporate_actions_v2' api src data_provider tests` 无匹配。
- 定向：`.venv/bin/pytest -q tests/test_thesis_ledger_v2_dependencies.py tests/test_fundamental_adapter.py`，25 项通过。
- DSA 官方离线门禁：以 `.venv/bin` 置于 `PATH` 执行 `./scripts/ci_gate.sh offline-tests`，7515 项通过、1 项跳过、4 项未选。首次未指定虚拟环境时因系统 Python 缺少 `pytest` 立即退出；上述结果是使用仓库虚拟环境重新执行后的完整结果。
- 受影响文件 `py_compile`、关键 `flake8 --select=E9,F63,F7,F82` 和 `git diff --check` 通过。

## 证据边界

验证对象是当前未提交的 DSA 工作区源码，未同步到目标容器；未运行真实 Provider、目标 Server→DSA HTTP、Worker 或产品验收。本叶只清理不可达适配链，E04-d、D02、D03 以及多来源回测 M1/M2/M3、AC01–AC20 继续未完成。
