# DSA 内部配置的 Web 设置可见性修复证据

日期：2026-09-28。任务：`CONT-DSA-settings-visibility`。

## 基线与范围

- DSA 基线 HEAD：`f497b6dad0e5519bbbcce1e51a2889d2c2634009`；主仓基线 HEAD：`fe0e871e37a09964f7a113b82e7d09f6d4d95f7e`。两仓均有其他并行 WIP，本轮未改动或整理它们。
- 本轮 DSA 写集仅 `src/core/config_registry.py` 与 `tests/test_config_registry.py`；主仓仅新增本文。未改 `.env.example`、token 值、API 鉴权或 fixture 行为。
- 修复前，`.venv/bin/python -m pytest -q tests/test_config_registry.py::TestEnvExampleWebSettingsCoverage::test_active_env_example_keys_are_registered_or_hidden_from_web_ui` 为 **1 failed**，差集恰为 `THESIS_LEDGER_DSA_TOKEN`、`THESIS_LEDGER_FIXTURE_MODE`。系统 `python` 未安装 pytest，实际复现与后续验证均使用 DSA `.venv`。

## 修改与行为边界

- 将两个键加入 `WEB_SETTINGS_HIDDEN_FROM_UI`，明确声明服务间 Bearer token 与内部 fixture 开关不属于普通 Web 可编辑设置。
- 测试显式断言两个键均在隐藏集中，且不在注册字段键或 `build_schema_response()` 的字段投影中。
- 源码引用核对表明 `WEB_SETTINGS_HIDDEN_FROM_UI` 仅被测试使用；生产设置字段来自 `_FIELD_DEFINITIONS`，`build_schema_response()` 也遍历该注册表。因此本次是配置覆盖契约修复，**未改变生产 UI 的过滤逻辑或现有可见字段**。

## 定向验证

| 检查 | 结果 |
| --- | --- |
| `.venv/bin/python -m pytest -q tests/test_config_registry.py` | **59 passed，2 warnings**；警告来自已安装的 FastAPI/Starlette 依赖弃用提示。 |
| `.venv/bin/python -m py_compile src/core/config_registry.py tests/test_config_registry.py` | 通过。 |
| `git diff --check -- src/core/config_registry.py tests/test_config_registry.py` | 通过。 |
| `.venv/bin/python -m flake8 src/core/config_registry.py tests/test_config_registry.py` | 未全绿：存量测试类间空行触发 `E302`，位置随本轮新增 16 行移至 `tests/test_config_registry.py:782`；HEAD 同处也只有一个空行。 |
| `.venv/bin/python -m flake8 --ignore=E302,E501 src/core/config_registry.py tests/test_config_registry.py` | 通过。`E501` 为存量长行；此限定检查不等价于完整 lint 通过。 |

未执行第三次全包测试、网络/账号、Docker 目标同步或浏览器验收。本轮证据只证明离线配置注册表断言与字段投影，不代表目标运行态或其余官方离线门禁已通过。
