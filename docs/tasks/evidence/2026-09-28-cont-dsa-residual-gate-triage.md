# DSA 残余门禁失败分诊

日期：2026-09-28。任务：`CONT-DSA-residual-gate-triage`。本轮只读检查 DSA 源码、测试、配置和 Git 工作树；唯一新增文件为本文。未运行测试、真实 Provider、账号、数据库或目标运行态，也未修复 DSA。分诊依据是 [官方稳定门禁证据](2026-09-28-cont-dsa-stable-gates.md) 中完整离线门禁的 16 个失败：本轮只覆盖其中六类、七个断言，不改变其 **7208 passed / 16 failed / 1 skipped / 4 deselected** 的失败结论。

## 基线与归因边界

DSA 工作树有其他并行 WIP。对本轮六类涉及的精确文件执行 `git status --short -- <paths>` 和 `git diff --numstat -- <paths>`：只有 `requirements.txt` 为本批未提交修改（5 行新增、1 行删除）；下述其他源文件、测试和 `.env.example` 均未修改。`git show HEAD:.env.example` 也显示两个 ThesisLedger 变量在基线第 8–9 行。故仅凭本次门禁失败不能把其余五类归因于本批源码修改；它们仍然是当前官方门禁的实际阻断项。隔离副本的输入一致性、环境限制和失败 nodeid 以官方证据为准。

| 类别与精确断言 | 源码条件及本批关系 | 分诊与最小后续写集 |
| --- | --- | --- |
| AlphaVantage 无 key 时为 `''`，测试要 `None`：`tests/test_alphavantage_fetcher.py:187-192` | `data_provider/alphavantage_fetcher.py:64-75` 用 `(api_key or "").strip()`，无配置或环境值时必得空串；取数入口 `:81` 用 falsy 判断禁用。测试显式移除环境变量并 mock 配置 `None`。源和测试均未修改，与本批目标功能无直接关系。 | **既有测试与实现契约失配**，不是隔离环境偶发失败。无 key 禁用行为本身未见故障证据；若维持当前归一化契约，最小写集为该测试，断言空串并覆盖禁用行为。若调用方依赖 `None`，先排查该契约，再改 fetcher 与测试，不能仅为过断言改运行态。 |
| Finnhub 无 key 时为 `''`，测试要 `None`：`tests/test_finnhub_fetcher.py:183-188` | `data_provider/finnhub_fetcher.py:43-52` 同样归一化为空串，取数入口 `:58` 用 falsy 判断禁用。测试显式移除环境变量并 mock 配置 `None`。源和测试均未修改，与本批目标功能无直接关系。 | **既有测试与实现契约失配**，不是隔离环境偶发失败。最小写集为该测试；如确有 `None` 调用方契约，再连同 fetcher 修正，不能仅为过断言改运行态。 |
| `requirements.txt` 非 ASCII：`tests/test_check_env_encoding.py:44-47` | 断言直接 `read_bytes().decode("ascii")`。`requirements.txt:10` 本批将英文注释换成中文，首个非 ASCII 出现在 byte 402；文件末尾新增的 RQData 中文注释也是后续非 ASCII 输入。`git show HEAD:requirements.txt` 同位置为纯 ASCII。 | **本批真实输入格式回归**，与当前 DSA 工作批次的依赖清单修改有关，虽非行情行为缺陷，却直接阻断官方门禁。最小写集仅 `requirements.txt`：保留已决定的依赖约束及其含义，将这两处说明改成 ASCII；测试无须放宽。本文只分诊，不能在只读 DSA 写集内代修。 |
| `.env.example` 两个键缺少 Web 设置分类：`tests/test_config_registry.py:559-575` | `.env.example:8-9` 的 `THESIS_LEDGER_DSA_TOKEN`、`THESIS_LEDGER_FIXTURE_MODE` 在 HEAD 已存在；`src/core/config_registry.py:73-82` 的隐藏集无二者，注册字段也无二者。测试比较 active key 与注册/隐藏集的差集。实际消费在 `api/thesis_ledger.py:105-115`（服务间 Bearer token）及 `:164-171`（fixture 开关）。上述配置文件、测试未修改；API 虽有其他并行改动，这两个读取入口不是本断言差集的原因。 | **既有配置覆盖缺口，属真实设置表面契约问题**。服务间 token 与内部 fixture 开关不宜直接作为普通 Web 可编辑项暴露；最小写集是 `src/core/config_registry.py` 的有意隐藏集合，并在 `tests/test_config_registry.py` 验证隐藏意图，必要时同步配置文档。不能删除 `.env.example` 键或简单放宽差集断言；需要配置/安全所有者确认这两个键的 UI 策略。 |
| `prompt_cache_key` 被 LiteLLM 转发：`tests/test_provider_cache.py:331-448` | 测试在独立子进程直接调用 `litellm.completion(... prompt_cache_key="cache-key")`（`:407-418`），自建 localhost HTTP capture 收到请求后在 `:448` 断言 body 无该字段。官方门禁使用 LiteLLM 1.100.0，capture 确实收到字段；不是网络禁令或账号失败。DSA 自有 `src/llm/provider_cache.py:51,509-537` 只在 verified/smoke_tested 时加提示，当前 OpenAI 默认 `doc_only` 在 `:218-224`；调用点 `src/analyzer.py:3203-3210` 使用该结果。相关 DSA 源/测试未修改。 | **既有依赖传输契约失效，同时测试对象错层**：直调第三方库只证明当前安装版本会透传，不能证明 DSA 自有门控一定发出了该键。若产品要求任何未验证提示都不出网，应在实际 LiteLLM 派发边界检查/过滤，并以 DSA 调用路径的 localhost capture 回归验证；最小写集待查派发封装、`tests/test_provider_cache.py`，必要时再约束依赖版本。不能把现有失败标为隔离误报，也不能仅删掉断言后声称安全边界成立。 |
| Yfinance 两个 TTM 断言从 4 变 3：`tests/test_yfinance_fundamental_adapter.py:123`、`:160` | 两个 fixture 分别在 `:99`、`:145` 含固定 `2025-08-11`。`data_provider/yfinance_fundamental_adapter.py:285-308` 以 `pd.Timestamp.now(...) - 365 days` 计算 TTM；到 2026-09-28，该事件已越界，余 3 个。测试还断言 TTM 金额/收益率（`:124-127`、`:162-163`），会随窗口改变。源和测试均未修改。 | **既有随墙上时钟过期的测试 fixture**，不是 Provider 数据或隔离环境问题；当前 3 次符合实现的滚动年窗。最小写集仅测试：固定业务观察时刻（如 2026-08-01）并同时核对 4 次、1.05 金额及收益率，或改成相对日期 fixture；不要将产品 TTM 窗口延长，也不要简单把期望 4 改 3 而留下随时间继续失效的测试。 |

## 后续门禁要求

这七个断言均属于官方 16 个失败的一部分，不能据分诊推定目标 DSA 已可同步。按相关所有权分别修复并进行定向验证，再由协调者重新评估完整离线门禁；其他九个失败、隔离前提与跨仓运行态仍按官方证据保持未通过/未验证。本轮没有执行任何验证命令，结论是源码和断言的静态归因。
