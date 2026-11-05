# DSA 提示缓存 Router 消费面净化证据

日期：2026-09-28。任务：`CONT-DSA-prompt-cache-consumers`，依据主 Task §12.9 和[边界发现](2026-09-28-cont-dsa-prompt-cache-boundary.md)。本叶状态：`worker_done`，仅完成 Agent 与 screening 两个消费面的本地合同验证，不代表 DSA 完整门禁或目标验收通过。

## 写入范围与输入

- DSA HEAD：`f497b6dad0e5519bbbcce1e51a2889d2c2634009`；主仓 HEAD：`fe0e871e37a09964f7a113b82e7d09f6d4d95f7e`。原有大量其他 WIP 保留，未暂存、提交或回退。
- 仅修改 DSA `src/agent/llm_adapter.py`、`src/services/screening/ranker.py`；新增 `tests/test_agent_prompt_cache_router_boundary.py`、`tests/test_screening_prompt_cache_router_boundary.py`；主仓仅新增本文。统一 helper `src/llm/prompt_cache_request_boundary.py` 由并行 core 叶提供，本叶没有修改。
- 只使用合成 key、合成 prompt、内存 Router 捕获及临时 YAML；没有读取真实凭据，也没有真实 Provider、外网、目标容器或数据库调用。

## 实施合同

- Agent 的渠道/YAML Router 与多 key legacy Router 构造均传入 `sanitize_prompt_cache_router_deployments(model_list)` 的复制结果。原配置和 legacy 原列表不变，其它 deployment 参数保留。
- screening 从 YAML 读到的 `model_list` 在交给 Router 前经过同一 helper；后续请求参数恢复仍引用原列表，既有生成参数行为保持。移除了紧邻调用中仅重复抛出异常的内层 `try/except`，由原有外层异常处理覆盖。
- 两个生产大文件维持尺寸 ratchet：Agent 990→990 行；screening 1119→1117 行。没有修改 helper、Analyzer、Task 或其它 WIP。

## 本地验证

| 检查 | 结果 | 证据边界 |
| --- | --- | --- |
| 两份新测试及 `test_agent_litellm_route_resolution.py`、`test_screening_ranker.py` | 35 passed | Agent 渠道请求、legacy 双 deployment、screening 临时 YAML；模拟 Router 合并后捕获请求无预置 `prompt_cache_key`，保留 `api_base` 和 `model_info`，原配置仍含合成 key |
| `test_agent_pipeline.py -k llm_adapter` | 15 passed，70 deselected | 相邻 Agent adapter 行为回归 |
| `flake8 --select=E9,F63,F7,F82` 四个写入源码/测试文件；两份新测试完整 flake8 | 均通过 | 限定语法/关键错误和新增测试样式 |
| 四文件 `py_compile`；DSA `git diff --check` | 均通过 | 编译和已跟踪 diff 空白 |

首次定向收集因本叶编辑时留下 screening 内层 `try` 的语法错误中断；本叶修复后一次重跑为 3 passed，随后上述 35 项通过。生产文件完整 flake8（仅忽略 E501）仍报告 12 条未触及行的存量 E301/W503/E305/E203，故不声明全样式通过。未进行第三次 DSA 全包、真实 LiteLLM localhost HTTP wire、缓存命中率或目标运行态验收；本叶 Mock 捕获只证明应用交给 Router 的 deployment 和模拟合并请求合同。
