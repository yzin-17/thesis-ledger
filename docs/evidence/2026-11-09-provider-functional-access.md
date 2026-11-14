# 数据源统一身份与逐功能权限验收

## 实施范围与数据边界

DSA 将 TickFlow 合并为 `tickflow/tickflow`，删除 `tickflow-free` 注册，原匿名历史读取器保留为来源内部传输。3项日线、10项分钟、1项实时行情使用同一配置；匿名日线保留沪深 A 股、3650日及单响应10000行边界，不携带 Key。来源声明的逐能力凭证要求由权限检查、目录、修订与执行门禁共用，不能把免凭证日线的状态套用到账号接口。

权限检查继续固定快照、配置代次与草稿状态，TickFlow 在18秒内最多检查14次接口，无 Key 跳过分钟和报价；不自动开通、启用或购买权限。通用 Desktop 面板逐功能展示可用、缺权限、缺凭证及待验证原因；Tushare 积分字段按等级契约限定。Mobile 同步隐藏非等级来源的积分字段，并防止隐藏草稿继续提交旧等级信息。

当前政策194没有 TickFlow 或旧免费目标，无需写入新政策；来源原有 `enabled=false`、配置代次3及页面凭证保留。历史冻结记录保持原样。未提交 Git，保留其他任务改动。

## 定向验证

DSA 执行目录为 `daily-stock-analysis`：

- `.venv/bin/python -m pytest -q tests/test_tickflow_account_access.py tests/test_tickflow_free_history.py tests/test_tushare_account_access.py tests/test_configured_market_routes.py`：最终72项通过，覆盖统一身份、无 Key、部分权限、错误分类、草稿隔离、过期、Key 变化及无 Key 执行门禁。
- `.venv/bin/python -m pytest -q tests/test_thesis_ledger_control_v3.py tests/test_thesis_ledger_inventory_export.py tests/test_thesis_ledger_provider_runtime.py`：最终38项通过。
- `.venv/bin/python -m pytest -q tests/test_native_exact_daily.py tests/test_tickflow_fetcher.py tests/test_configured_market_routes.py`：68项通过；其中16项配置测试与上述72项重合，不重复计数。
- `scripts/check_thesis_ledger_capability_boundaries.py`、`scripts/check_data_runtime_contract.py`、`git diff --check`：通过。

Desktop 执行7个相关文件：`provider-account-access`、`provider-credentials-sheet`、`account-level`、`market-provider-capabilities`、`market-data-provider-ui`、`market-provider-enabled`、`market-experiment-recovery.ui`，最终44项通过。`pnpm --filter @thesis-ledger/desktop build` 与 schemas build 通过。Mobile 使用 `vitest run --dir test test/parity/batch5-state.test.ts test/parity/batch5-ui.test.tsx`，18项通过，typecheck通过；本次未改原生依赖或构建工程，未执行 Native compile。主仓 `scripts/check-boundaries.mjs` 通过。

## 失败归属与修复

- 目录退役后同步更新数量及来源集合断言；匿名响应的来源标记改为统一目标，另保留 `transport_source` 说明真实传输。
- 旧原生日线测试的 SDK mock 原先注入完整服务适配器，统一来源转向匿名传输后绕过该 mock，导致12项取得实源数据而不匹配合成值。随后将这些测试移到独立的共享日线解码器接缝，匿名执行链由专门受控样本覆盖，最终68项通过。
- Mobile 首次测试漏写 `--dir test`，误扫历史 release 副本并因旧 harness 缺失失败；限定真实测试目录后通过。新增纯输入测试初始引入 RN Flow 解析，隔离不相关的 UI primitives 后通过。
- 四屏宽受控浏览器脚本初始响应的检查时间不统一，被 schema 正确拒绝；统一时间后修正关闭页面时尚在处理的请求，最终通过。此问题属于验收脚本，没有放宽产品 schema。
- 并发新增 `local-materials` 使全来源数量/事件集合断言短暂失败；保留该来源实现，仅对齐共享集合断言，最终38项通过。早期临时隔离插件未传播到库存导出的子进程，不作为最终验收证据。
- 最终构建被并发新增的 `RuleMonitorAutomationEditor.tsx` 错误导入 `EmptyStates.LoadingState` 阻断；改为从现有 `@/components/ui/spinner` 导入，构建通过。未改自动化业务逻辑。

## 正式更新与目标运行态

执行目录：`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`，PATH 选择本机 Node26.13.0、Volta、Homebrew 与 Docker 工具；未设置改变业务行为的额外开关。

1. `./scripts/sync-code.sh dsa`：初次退出1，兼容性门禁报告依赖、Dockerfile、原生 SDK 或结构输入基线变化；保留门禁，未绕过。
2. `./scripts/update.sh dsa`：退出0，完成正式构建、保留挂载、重建及健康检查。DSA 镜像为 `sha256:6a7b294b65aee56149fa79ed2b6036a7b175cd674c0acf1c65a4b3c12a6a92a1`。
3. 后续补齐精确能力凭证门禁后再次 `./scripts/sync-code.sh dsa`：退出0，镜像保持不变。此时门禁修正仅位于容器可写层；该阶段限制已由下面的完整镜像更新解除。
4. 用户要求将最终修正固化后，再次从同一 infra 目录执行 `./scripts/update.sh dsa`：退出0，构建新镜像并重新创建目标容器，未再执行快更。新镜像为 `sha256:586491761c9d4b40df50deda73e26793d282562ffe8d30aa9c8868b9a227c118`，新容器为 `ac17fb8d6e527b7a51c7803ac2f28568dc3b91cde03cb44adf5953e3e0972081`，健康状态为 `healthy`。

### 最终镜像固化的独立验证

`docker inspect` 确认镜像与容器均已更换。只读 `docker exec ... python -B` 计算以下12个文件的 SHA-256，与宿主当前源码全部一致：

- `src/services/thesis_ledger_route_credentials.py`
- `src/services/thesis_ledger_account_access.py`
- `src/services/thesis_ledger_account_access_contract.py`
- `src/services/thesis_ledger_capability_registry.py`
- `src/services/thesis_ledger_route_catalog.py`
- `src/services/thesis_ledger_market_v3_revisions.py`
- `src/services/thesis_ledger_price_route_access.py`
- `src/services/thesis_ledger_control.py`
- `data_provider/thesis_ledger_sources/tickflow.py`
- `data_provider/thesis_ledger_sources/tickflow_free_history.py`
- `data_provider/tickflow_account_access.py`
- `data_provider/tickflow_daily.py`

没有挂载覆盖上述代码路径，`docker diff` 对上述文件的可写层差异为0。因此最终修正来自新镜像本身，已通过实际容器重建验证，不依赖快更层。

新容器内再次验证：旧免费来源未注册，TickFlow14项绑定，日线无需凭证、分钟及报价需要凭证。目标 API 目录完整且仅含统一 TickFlow；政策仍为194/applied，来源仍停用、配置代次3、页面凭证仍已配置。此次仅固化镜像，没有重复执行外部权限检查或修改业务配置。

独立读取目标 API，最终29个来源中仅一个 TickFlow；完整目录459项，其中TickFlow14项、旧免费来源0项。总数包含并发“本地资料”工作，不代表本任务接入了该来源。政策仍为194、applied，未选 TickFlow。只读目标容器检查确认 `DAILY_BAR=False`、`MINUTE_BAR=True`、`REALTIME_QUOTE=True` 的凭证要求。

## 真实上游与浏览器

使用空凭证快照直接运行来源账号检查器，分别读取匿名日线 `none/qfq/hfq`，三次均为 `allowed, attempted=true`，每次超时3秒、SDK重试0。未向账号接口发送真实 Key，完整服务的实际账号权限未在本次自动验收中探测，仍由用户点击检查。

实际浏览器访问宿主 Vite `http://127.0.0.1:5173/market-data` 与目标 Docker API。1440、1024、768、390均确认只有一个 TickFlow、检查入口可见、没有积分字段、弹窗边界正常且可取消；未提交真实凭证或启用操作。

另用受控请求模拟空 Key：同样四种宽度确认3项可用、11项缺凭证，单次检查不带等级或凭证字段，未调用外部上游。截图为本机临时产物 `/tmp/tickflow-live-{width}.png` 与 `/tmp/tickflow-functional-access-{width}.png`，不纳入 Git。

## 最终一致性结论

AC1–AC4 已覆盖，当前来源身份、逐能力凭证契约、目录和界面一致。最终修正已完整构建进新镜像，并通过新容器重建、12个文件哈希、无代码挂载及无可写层代码差异验证。其他支持账号检查的来源复用通用展示，库存中没有另一组按免费/收费重复注册的来源。本次不新增其他供应商接口、认证、付费权限或历史业务事实；未把受控检查扩张为完整账号实源成功。
