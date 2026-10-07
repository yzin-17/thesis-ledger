# CONT-DSA-prompt-cache-boundary 只读发现

## 范围与结论

- 本轮只读 DSA 源码、测试及本地已安装的 LiteLLM 1.100.0 实现；仅使用合成值做了不触网的 helper 探针。未读取凭据，未调用真实 AI、Provider 或外网，未改动 DSA。
- 已知完整离线测试 `tests/test_provider_cache.py::test_litellm_openai_prompt_cache_key_is_not_passed_through_without_verified_capture` 失败：它直接给第三方 `litellm.completion` 传 `prompt_cache_key`，当前 LiteLLM 会把该字段送到本地捕获端。这一断言把应用门禁责任放在了第三方 SDK 上，单独不能证明应用默认请求回归；也不能据此删除门禁断言。
- 应用确有可达的合同缺口：`LITELLM_CONFIG` 的 `model_list[].litellm_params.prompt_cache_key` 可保留到 Router deployment。LiteLLM Router 将 deployment 参数并入最终 `litellm.completion`。`doc_only` 和默认关闭的 hint 门禁只控制 helper **主动新增**字段，未净化预先存在的字段。这是配置可达的边界问题，不能归类为纯第三方测试问题。完整的应用入口到 localhost wire 捕获仍待实施验证。

## 请求路径证据

1. DSA `src/llm/provider_cache.py:509-539` 对输入 `call_kwargs` 深拷贝后，在 `hints_disabled` 或 `capability_not_verified` 分支原样返回；只有 `:548-563` 在已验证且开启 hints 的 OpenAI 路由主动写入 HMAC key。注册表 `:218-224` 的 OpenAI chat completions 状态是 `doc_only`。不触网探针结果：预置合成 key 在 hints 关闭、hints 开启但 `doc_only` 两种情况下均被保留，后者的 `disabled_reason=capability_not_verified`。
2. DSA `src/config.py:1525-1550` 优先从 `LITELLM_CONFIG` 解析 YAML；`:2274-2310` 取 `model_list` 并仅解析 `os.environ/` 引用，没有对 `litellm_params` 做字段白名单或删除 `prompt_cache_key`。`LLM_CHANNELS` 的生成器 `:2568-2614` 只组装 model/key/base/headers，遗留 `extra_litellm_params` `:3689-3706` 也只给 base/headers；它们目前不是这个字段的来源。
3. Analyzer `src/analyzer.py:2470-2496` 将 channel/YAML 的 `model_list` 交给 Router。`:3170-3211` 构造请求并调用 hint helper；`:3217-3238` 的 streaming 与 `:3270-3283` 的非 streaming 都经过 `_dispatch_litellm_completion`。派发器 `:2750-2787` 在 Router 模式下使用 `self._router.completion(**effective_kwargs)`；Hermes-only 分支只从 deployment 取 model/key/base，不把其余 deployment 参数并入请求。`src/llm/errors.py:115-148` 的参数恢复只处理已识别的生成参数错误，不删除 cache key。
4. 本地已安装 LiteLLM 1.100.0 的 `.venv/lib/python3.12/site-packages/litellm/router.py:2132-2177` 从 deployment 复制 `litellm_params`，随后以 `**litellm_params`、`**kwargs` 构成 `input_kwargs` 并调用 `litellm.completion`。结合已知直调 localhost 捕获结果，YAML 预置 key 到 wire 的路径在源码层闭合；本轮未实际执行该完整路径的捕获。
5. Agent `src/agent/litellm_route_resolution.py:66-120` 从 `config.llm_model_list` 过滤 Hermes deployment，保留其他 deployment 参数；`src/agent/llm_adapter.py:458-480,755-777` 把列表交给 Router 并执行请求，仅输出诊断，不调用 `apply_prompt_cache_hints`。Screening `src/services/screening/ranker.py:540-550,925-959` 直接重新读取同一 YAML 并构造 Router，也不经 helper。两者是同一配置入口的额外可达消费面。
6. 其他已检查调用点：`image_stock_extractor.py:308-339` 只从 deployment 取 model/key/base/headers；`system_config_service.py:1310-1378` 和 screening 的 direct fallback `ranker.py:1038-1080` 固定构造请求参数。当前未发现这些路径从配置传入 `prompt_cache_key`，但它们同样不受 analyzer 的 hint helper 保护。`tests/test_market_analyzer_generate_text.py:845-866` 只验证无预置字段时的 Analyzer 请求，没有覆盖 YAML deployment 注入。

全局 `src/**/*.py` 检索到的 LiteLLM Router 初始化点为 Analyzer `src/analyzer.py:2492,2537`、Agent `src/agent/llm_adapter.py:477,515`、screening `src/services/screening/ranker.py:941`。实际请求入口为 Analyzer 的 Router/direct/Hermes 派发 `src/analyzer.py:2750-2787`，Agent 的 Router/direct 派发 `src/agent/llm_adapter.py:755-777`，screening 的 Router/direct 派发 `src/services/screening/ranker.py:540-577,925-959`，图像提取 `src/services/image_stock_extractor.py:339`，渠道连接测试 `src/services/system_config_service.py:1370-1378`。`SkillRouter` 是另一种业务路由器，不是 LiteLLM Router。`apply_prompt_cache_hints` 的唯一源码调用点是 Analyzer `src/analyzer.py:3209`。Screening 的配置链从 `src/services/screening/config.py:287` 读取 `LITELLM_CONFIG`，经 `pipeline.py:423` 到 `ranker.py:540-550`。

## 合同层级与最小修复面

- 合同应定义在 DSA 自有的出站请求和 Router deployment 边界：未验证路由不能向 wire 发送 `prompt_cache_key`，不论它来自 helper、显式请求参数还是 YAML；已验证且主动开启 hints 的生成值才可通过。配置由操作者提供，当前证据支持“能力门禁与请求合同缺口”，不支持推断外部用户可注入或已经泄漏敏感信息。
- 最小源码改动候选：在 `src/llm/provider_cache.py` 提供对已有 request key 和 Router `model_list` 中该字段的统一净化/验证能力；在 `src/analyzer.py`、`src/agent/llm_adapter.py`、`src/services/screening/ranker.py` 的 Router 构造/调用边界接入。只处理 helper 会漏掉 Router 后合并的 deployment 参数；只处理 `Config._parse_litellm_yaml` 会漏掉 screening 自行读取的 YAML 和内存注入的列表。固定参数的 direct 调用点可用负例测试证明无需修改。具体实现应保留其他 LiteLLM 参数和原配置对象不变。
- 最小测试改动候选：`tests/test_provider_cache.py` 将现有第三方直调捕获改作 SDK 透传对照，同时保留“未验证 key 不到 wire”的断言并转移到应用请求路径；`tests/test_market_analyzer_generate_text.py`、Agent 路由测试和 screening 测试分别覆盖相应消费面。不能单纯删除失败测试或只改变预期来声称合同成立。

## 离线验收建议

- 使用 `127.0.0.1` 随机端口的 OpenAI-compatible 假服务，只记录捕获 JSON 中 `prompt_cache_key` 的存在性/合成值，测试输出不含密钥和真实 prompt。合成 YAML deployment 预置 key，分别通过 Analyzer 非 streaming、streaming、Agent Router 和 screening Router 触发请求；在 hints 默认关闭与开启但 `doc_only` 时均断言 wire **无 key**，且其他已配置参数仍可用。
- 增加预置 request `call_kwargs.prompt_cache_key` 的 helper 负例；增加无预置字段的默认路径负例；用测试内已验证 capability 与合成 HMAC secret 验证主动 hint 只发送派生 key、不发送原值且不变异输入。记录 direct LiteLLM 对照确实透传，以固定 SDK 行为与 DSA 责任边界。
- 验证层级：先定向离线 helper/Router 测试，再 DSA 离线套件；真实 Provider 行为、实际缓存命中率和成本效果不属于本轮证据。
