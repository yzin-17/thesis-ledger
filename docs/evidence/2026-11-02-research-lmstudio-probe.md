# LM Studio 保存配置与最小输出复测

用户要求试用LM Studio，并指出地址应从Provider配置读取。本次沿用保存的Provider公开回执；没有修改Provider、模型默认项、前端、业务数据或Docker状态。

## 配置来源与实际可用性

来源为`.recovery-artifacts/ai-auth-connection-20261030/after-public.json`中的`lmstudio`记录，保存修订时间为`2026-10-20T22:46:13.767Z`；本次副本与来源摘要见[配置快照](../../.recovery-artifacts/research-lmstudio-probe-20261102/saved-provider-snapshot.json)。当前Docker和项目API仍不可连接，不能将历史回执称为本次数据库反读结果。

- 地址：`http://192.168.5.20:6789/v1`；鉴权为`none`，`chat-completions`／`compatible`。
- 请求型号：`qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive@q4_k_m`；保存的模型请求参数为空，输入／输出用户费率均为0 USD。
- `GET /v1/models`和[官方目录端点](https://lmstudio.ai/docs/developer/rest/list)`GET /api/v1/models`均实测HTTP200。原生目录确认对应35B Q4_K_M模型；首测前`loaded_instances=[]`，超时后出现已加载实例。
- 默认本机1234端口不是该Provider的保存地址，先前默认端口拒绝连接不能用作此服务不可用的结论。

## 实际调用与边界

复用项目编译后的`AiSdkGenerationAdapter`，以`json_validated`测试最小对象`{"ok":true}`。两次均使用保存的型号、鉴权和空请求参数；实际出站未发送认证头或本地输出Token上限，SDK不自动重试。超时采用保存的`timeoutMs=30000`。

| 请求 | 结果 | 时长 | 用量 |
| --- | --- | --- | --- |
| 首测 | `provider_completion_timeout`，未收到HTTP终态；生成结果未知 | 30013毫秒 | 未知，不回填为0 Token |
| 模型加载状态改变后的同配置复测 | HTTP200、`stop`、完整JSON通过原Schema | 4398毫秒 | 输入38／输出239 Token |

复测返回的实际型号为`qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive`，原生目录量化为Q4_K_M；没有修改保存的型号或替换成其它模型。首测前后加载状态改变是复测依据，缺少服务端首测日志，不能断言冷加载是首测超时的唯一原因。

本次新增2次本地模型POST尝试；原Cloudflare／OpenRouter固定集实验保持68次，合计历史尝试70次。两次属于用户新要求的LM Studio连接试用，不扩展原五例实验的68次准入；原5 USD与历史未知预留保持。新增1次用量已知、按保存费率估算0 USD；另1次用量与上游结果未知，保存的零费率不能代替Token回执或独立账单。没有取得首测生成ID或补写其正文。

## 验证与当前结论

执行命令为`rtk proxy /Users/yzin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node .recovery-artifacts/research-lmstudio-probe-20261102/probe.mjs`，首次和复测进程均退出0，业务结果分别按上表记录；脚本退出0不覆盖首测失败。首测程序与回执保留于`attempt-1/`，复测写入`attempt-2/`，未覆盖原始失败。脚本语法检查通过；这轮没有应用源码变化，不重复运行包级测试或构建。

[汇总](../../.recovery-artifacts/research-lmstudio-probe-20261102/summary.json)与两次实际请求设置已复核：鉴权头均未发送、额外参数均为空、输出上限字段均不存在；原实验账本指针未改写，新增尝试独立登记供后续合并。T15d连接／最小JSON验证通过；当前数据库配置仍未实读，LM Studio的五例及三阶段效果尚未验证，不能据此关闭T15c.3、RA12或启用生产阶段化。未暂存、提交、部署或修改TODO。
