# CONT-DSA-prompt-cache-core 本地闭环

日期：2026-09-28。状态：`worker_done`，仅关闭主 Task §12.9 中本叶的 DSA Analyzer 与请求边界。Agent、screening 的消费面由 `CONT-DSA-prompt-cache-consumers` 独立验证；不据此认定真实 Provider、目标运行态或整体验收通过。

## 输入与范围

- 输入为主 Task §12.9、[只读发现](2026-09-28-cont-dsa-prompt-cache-boundary.md)、DSA `src/llm/provider_cache.py`、`src/analyzer.py`、LiteLLM 1.100.0 的本地 Router 行为，以及合成配置。未读取真实账号或凭据，未请求真实 Provider、目标服务或外网。
- DSA 基线 HEAD：`f497b6dad0e5519bbbcce1e51a2889d2c2634009`；最终定向测试的输入为下列五个文件及本地已安装依赖，SHA-256 分别为：`src/analyzer.py` `263eee61cf6f7f69f968a9e56cfdfa34e739759ccfbd3a709a879606697e10f1`；`src/llm/provider_cache.py` `aa23de7c5b4173eb7c10fb5da27fa6da256e303dda41ca6872cc9bd754255181`；`src/llm/prompt_cache_request_boundary.py` `c1e25cff52e1d4097ed95a7f727df5c340042dfac89f0fcd83deceaf671a7834`；`tests/test_provider_cache.py` `7f06bc16a3db8c7bd717133c1429605a4a3feb1bc06a6bad76cef3742133aef0`；`tests/test_prompt_cache_request_boundary.py` `9e66560fb46d83a794f042b5109c226be5837e61fdcac5ce68e835f6826a4ac0`。
- 仅修改 DSA `src/llm/provider_cache.py`、`src/analyzer.py`、`tests/test_provider_cache.py`；新增 `src/llm/prompt_cache_request_boundary.py`、`tests/test_prompt_cache_request_boundary.py`。主仓仅新增本文。保留两仓其他并行 WIP，未暂存、提交、重置或清理。
- 统一入口 `sanitize_prompt_cache_router_deployments(model_list: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]` 深拷贝 Router deployment，移除各项 `litellm_params.prompt_cache_key`，保持其他参数和原配置。Analyzer 的渠道/YAML 与 legacy 两处 Router 初始化均接入。

## 失败基线与修复

- 原 `tests/test_provider_cache.py` 直接调用 LiteLLM 并断言第三方自动丢弃 `prompt_cache_key`，与当前依赖的实际透传行为不符。改写后保留直调透传断言作为对照，同一测试再通过 `GeminiAnalyzer` + 合成 `model_list` 派发到 `127.0.0.1` 随机端口。首轮由于并行消费面已提前引用新模块，导入在模块创建前失败；创建模块后立即取得有效 red：Analyzer wire 收到合成 `configured-cache-key`。
- `apply_prompt_cache_hints` 先从复制的请求参数中移除预置键。关闭 hints、开启但能力为 `doc_only`、已验证但 HMAC 不可用时，请求不含该键；测试内模拟 verified 且开启 hints 时，生成值精确等于域分离 HMAC，原值不会透传，原请求不变。
- Analyzer 两种 Router deployment 在构造前复制净化。localhost wire 的默认关闭、`doc_only`、streaming 请求均无键；模拟 verified 且开启 hints 后，wire 收到 64 位派生键，未收到配置原值。独立单元测试同时验证嵌套参数保留、原配置不变和 legacy Router 接入。
- DSA 旧大文件 ratchet：`src/analyzer.py` 从基线 4804 行变为 4803 行，`src/llm/provider_cache.py` 保持 842 行；新增职责集中在独立 helper。

## 验证与限制

- 修复后 `rtk proxy .venv/bin/python -m pytest -q tests/test_provider_cache.py tests/test_prompt_cache_request_boundary.py tests/test_market_analyzer_generate_text.py`：最终 136 passed、2 条第三方弃用警告；其中 localhost wire 用例通过。未运行 DSA 第三次全包。
- `rtk proxy .venv/bin/python -m flake8 src/llm/provider_cache.py src/llm/prompt_cache_request_boundary.py tests/test_provider_cache.py tests/test_prompt_cache_request_boundary.py`：通过。`src/analyzer.py` 整文件严格 flake8 仍报存量 `E251/W291/W293/F541`，均不在本次改动行；对五个改动文件执行 `--extend-ignore=E251,W291,W293,F541` 后通过。未改动存量问题。
- 五个改动 Python 文件 `py_compile` 通过；跟踪文件 `git diff --check` 通过。测试依赖本地模拟能力与 localhost OpenAI-compatible 服务，不能证明真实 Provider 接受、命中或计费行为，也不替代 DSA 第三次全包或目标同步。
