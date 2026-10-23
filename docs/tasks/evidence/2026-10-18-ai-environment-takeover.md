# AI Provider 环境正向接管隔离验收

日期：2026-10-18  
适用基线：HEAD `da002744` 加当前未提交工作树；本叶新增的服务测试未提交。  
关联断言：`2026-09-21-ai-provider-model-usage-configuration.md` 的 T2.5 / T5.2，`2026-09-19-vercel-ai-sdk-integration.md` 的 AC48 环境来源接管与凭证保存。

## 范围与隔离

本叶验证有值环境来源的 AI Provider 通过服务端普通保存转为数据库来源。调用真实 `AiProviderService.save` 和 `ProviderConfigService.saveAi`，持久化边界使用测试内存 Prisma；不连接 PostgreSQL，不读写现有配置或默认设置，不启动 Server、Worker、Docker 或 Electron。

测试使用专用 `AI_PROVIDER_CONFIGS_JSON`、假 API Key、假加密密钥及隔离数据库 URL。测试命令通过 `env -i` 启动，未继承终端凭证。保存测试以 `fetch` 和 SDK `generate` 桩监测外部请求；两者均为零调用。报告不记录任何凭证值。

## 结果

| 断言 | 结果 | 证据 |
| --- | --- | --- |
| 环境来源含有 URL、模型、超时和费用值时，显式提供新凭证可通过真实保存链路接管为数据库来源 | 通过 | `ai-provider-environment-takeover.test.ts`：保存回读含原 URL、模型、超时与模型级费用；摘要标为 `database` 且 `credentialConfigured: true` |
| 保存后的凭证经过 Provider 凭证加密边界，摘要不回传凭证 | 通过 | 测试从真实 `ProviderConfigService.readCredential` 解密得到本次测试假凭证；加密字节不含明文，保存摘要不含环境或接管假凭证 |
| 缺少显式接管凭证时拒绝写入并保留环境来源 | 通过 | `AiProviderService.save` 返回“接管部署配置时必须重新输入 API Key”；内存存储未创建记录，列表仍显示 `environment` 来源 |
| 研究默认引用存在时，不允许接管操作停用 Provider、移除默认研究用途或直接停用 Provider | 通过 | 三种操作均被保存/生命周期保护拒绝；版本与数据库行未改变，默认设置更新桩未调用 |
| 默认引用清除后停用的数据库配置不会被环境来源复活；普通保存省略 `enabled` 时继续保持停用 | 通过 | 生命周期停用与后续普通保存均走实际服务；读取仍为单个 `database` 来源且 `enabled: false`，凭证仍可解密 |
| 使用旧 `expectedRevision` 保存已变更 Provider | 通过 | 实际 AI 保存服务在写入前返回版本冲突；内存 Prisma 的更新调用数未增加 |
| 生成或连接请求 | 零调用 | 注入的 SDK `generate` 和全局 `fetch` 均未调用 |

旧环境费用字段在本次服务保存输入中映射为模型级 `modelPricing`；数值保留在数据库来源摘要中。未将历史环境配置中的旧能力声明或免费依据复制到验收夹具。

## 验证命令

从仓库根目录执行，测试进程只继承显式保留的 `PATH` 和 `NODE_ENV`：

```sh
rtk proxy env -i PATH="$PATH" NODE_ENV=test pnpm --dir apps/server exec vitest run test/ai/ai-provider-environment-takeover.test.ts
```

结果：1 个测试文件通过，2 个测试通过；测试运行期间 `fetch` 与 SDK `generate` 调用数均为 0。

```sh
rtk proxy env -i PATH="$PATH" NODE_ENV=test pnpm --dir apps/server typecheck
```

结果：Server 包 `tsc -p tsconfig.json --noEmit` 通过。未运行全仓测试、构建、数据库或目标运行态检查。

主代理复核后，新增测试的定向 ESLint 与测试/本报告的 Prettier 检查通过；仅对新增测试应用格式调整，没有改变服务实现或验收断言。

## 调试记录

前四次定向运行只暴露了隔离夹具与断言问题，没有发现生产保存缺陷：

1. 初始夹具显式设置空 `AI_API_KEY`，违反配置 Schema 的非空约束，环境配置加载失败。删除该无关变量后，环境来源及缺凭证拒绝场景正常进入服务。
2. 接管后以旧字段保存时未携带模型级 `modelPricing`，触发服务已有的完整配置保护。为后续保存提供完整模型价格输入。
3. 将模型级 `modelPricing` 放进环境 JSON 夹具会使旧环境配置解析失败。保留当前兼容的环境费用字段，把它映射到普通保存输入中的 `modelPricing`。
4. 最初断言数据库摘要仍展示 Provider 级旧费用字段；实际保存按新契约呈现模型级价格。改为检查模型价格数值保留。

最终定向测试与 Server 包 typecheck 均通过。

## 证据边界

这是服务级隔离测试，证明实际服务保存与凭证加密方法在合成输入下的行为；内存 Prisma 不证明 PostgreSQL、事务竞争或目标 Server 运行态。它不证明凭证来自真实部署环境、真实凭证保留/迁移、安装版完整转换、认证连接、真实 Provider 可用性、用途生成、费用结算、Electron 或 T5.2 完整 AC。真实生成、连接探针、用途请求均未执行；目标运行态与更大范围验收仍保持未通过。
