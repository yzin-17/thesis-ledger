# AI Provider 模型发现实施任务

对应 Spec：[2026-09-15-ai-provider-model-discovery](../../specs/2026-09-15-ai-provider-model-discovery.md)

> 任务标识：`ai-provider-model-discovery`
> 状态：源码实现与分层验证完成；当前运行中的 Docker Server 尚未重建，部署后生效。

## 任务

- [x] T1：实现 Server 模型目录代理
  - 覆盖：AC1、AC2、AC4
  - 范围：`apps/server/src/ai/**` 与定向测试，不修改数据库 Schema。
  - 完成条件：支持草稿 Key、数据库凭据复用、响应校验、数量限制、超时和错误脱敏。
  - 验证证据：新增 `POST /ai/providers/models` 与独立目录解析 helper；草稿 Key、数据库凭据、排序去重、错误脱敏、Registry 无副作用、Base URL 绑定和禁止重定向均有定向测试。

- [x] T2：实现 Desktop 获取、筛选与选择交互
  - 覆盖：AC3、AC4
  - 依赖：T1 接口契约
  - 范围：`apps/desktop/src/features/providers/**` 与定向测试；复用现有 shadcn/Base UI 组件和原子类。
  - 完成条件：获取不会保存配置；选择最多 32 个；失败不清空当前草稿选择；凭据不进入查询缓存。
  - 验证证据：模型目录使用 `gcTime: 0` 的 TanStack mutation，完成后立即 reset；目录支持筛选、鼠标/键盘多选和 32 个上限。

- [x] G1：验证与一致性 Review
  - 覆盖：AC1–AC5
  - 完成条件：定向测试、TypeScript、边界、文件尺寸、目标 Compose 和浏览器页面均通过；文档与实现一致。
  - 验证证据：Server 2 个测试文件 13 个测试、Desktop 3 个测试文件 45 个测试通过；两端 TypeScript、scoped ESLint、边界、文件尺寸 ratchet 与 diff check 通过。目标镜像健康启动，OpenRouter `/models` 返回 447 个模型；浏览器筛选 `:free` 得到 19 个结果并验证选择写回。

- [x] T3：将模型文本框替换为标签式多选 Combobox
  - 覆盖：AC3、AC4
  - 依赖：T1、T2 已完成的模型目录接口与草稿状态契约
  - 范围：`apps/desktop/src/features/providers/**`、官方 shadcn/Base UI Combobox 组件与定向测试；不修改 Server 接口、数据库 Schema 或其他 Provider 表单。
  - 完成条件：模型字段不再渲染 `textarea`；已选模型以内联标签展示并可删除；候选列表可搜索、可键盘操作且标记选中状态；接口候选与已有选择合并；继续执行 32 个上限。
  - 验证方式：Desktop 定向测试覆盖渲染、合并、增删和上限；通过 TypeScript、scoped ESLint 与文件尺寸门禁。
  - 验证证据：引入适配项目 Base UI/Vega 配置的官方 shadcn Combobox；接口目录与既有选择合并，内部仍复用既有草稿保存契约。Desktop 3 个测试文件 45 个测试、生产 build、scoped ESLint、边界、文件尺寸 ratchet 与 diff check 均通过。

- [x] G2：完成目标页面浏览器验收与一致性 Review
  - 覆盖：AC3–AC5
  - 依赖：T3
  - 完成条件：在 AI Provider 编辑 Sheet 中验证获取、搜索、标签增删、列表选中状态、键盘操作和无 `textarea`；文档与实现一致后重新归档。
  - 验证证据：目标页面获取 OpenRouter 447 个模型；编辑器内 `textarea` 数量为 0；精确搜索、列表选中状态、下方实色浮层、键盘新增和标签删除均通过，页面控制台无错误。验收过程中未保存 Provider 草稿。

- [x] T4：扩展 Server 模型目录与测试策略
  - 覆盖：AC6、AC8
  - 依赖：T1 的模型目录代理与既有 AI Provider 配置契约。
  - 范围：`apps/server/src/ai/**` 与定向测试；不修改数据库 Schema，不持久化完整第三方目录。
  - 完成条件：兼容保留模型 ID 数组并返回规范化推理元数据；保存时只保留已选模型元数据；已知强制推理或不支持 `none` 时连接测试不发送 `effort: "none"`。
  - 验证方式：目录解析、非法元数据降级、配置 round-trip、测试请求体与既有无元数据兼容测试。
  - 验证证据：目录解析保留 `models: string[]` 并新增 `modelDetails`，仅接受已知推理字段且区分 `supported_efforts: null` 与字段缺失；保存和回读均过滤到当前选中模型。连接测试对强制推理或明确不支持 `none` 的首模型省略 `reasoning` 并提高输出预算，既有无元数据配置保持原策略。Server 全套 96 个测试文件、628 项测试通过，3 个测试文件共 11 项因环境条件跳过。

- [x] T5：展示模型推理能力
  - 覆盖：AC7、AC8 的 Desktop 契约
  - 依赖：T4 的响应与配置契约就绪。
  - 范围：`apps/desktop/src/features/providers/**` 与定向测试；复用现有 Combobox、Badge 和原子类，不新增推理强度编辑控件。
  - 完成条件：模型候选项展示推理强度、默认值和强制状态；未声明时不猜测；搜索、多选、顺序和上限行为保持不变；仅提交已选模型元数据。
  - 验证方式：Desktop 渲染/序列化测试、TypeScript、scoped ESLint 与浏览器交互。
  - 验证证据：候选项使用 Badge 展示支持强度、默认强度、强制推理和未声明状态；选择、删除与目录刷新均只维护已选模型元数据。Desktop AI Provider 定向测试 14 项通过，两端 TypeScript、生产 build、scoped ESLint、Prettier、边界与文件尺寸 ratchet 通过。

- [x] G3：推理元数据组合验收与一致性 Review
  - 覆盖：AC6–AC8
  - 依赖：T4、T5。
  - 完成条件：目标 OpenRouter 目录至少返回一项可观察的推理元数据；页面展示与接口一致；连接测试策略按 `mandatory`/`supported_efforts` 生效，未泄露凭据或增加无关页面请求。
  - 验证方式：Server/Desktop 定向检查、目标页面浏览器验收和必要的受控请求体证据。
  - 验证证据：当前 Server 源码直接请求 OpenRouter 公共目录得到 447 个模型，其中 314 个带规范化推理元数据；受控浏览器目录响应验证全部 Badge 状态，多选连续选择两项后浮层保持打开，内部输入框 `outline-style: none` 且无阴影，控制台无错误。浏览器验收未填写 API Key、未保存草稿；当前运行中的 Docker Server 仍是旧构建，因此不把该容器声明为已加载本次改动。

## 最终一致性 Review

- [x] Spec 的全部验收断言均有明确实现与适当验证
- [x] 所有已勾选任务满足自身完成条件且证据仍有效
- [x] 必要集成、真实运行态与条件性门禁均已通过或有合法不适用依据
- [x] 启动依赖、验收依赖与契约就绪证据正确且无循环
- [x] 跨任务接口、类型、状态、时间、错误与副作用语义一致
- [x] 不存在未解决的 Blocking 问题、占位要求或未定义契约
- [x] 实现未超出 Spec 范围，未把可选设施变成强制要求
- [x] 证据类型、场景覆盖、代码版本与目标环境支持所声明的验收结果
- [x] 测试、配置、文档、Spec/Task 状态与实际实现一致
- [x] 必要实施 Step 已验证；未创建提交且保留既有用户修改
- [x] 未发现未处理的实现、Spec、任务或验收证据不一致

### Review 结论

- 结论：源码实现与分层验收通过。模型目录兼容返回推理元数据，Desktop 完成展示和选中范围持久化，连接测试能够避开已知不支持 `none` 的模型约束。
- 运行态边界：当前运行中的 Docker Server 是本次修改前的旧构建；为避免把共享脏工作树中的其他数据库和 Server 改动一起部署，本次未重建该容器。上述结论不等同于目标 Docker 已加载新代码。
- 环境说明：首次镜像构建失败的根因是 BuildKit `ERR_PNPM_ENOSPC`；经明确授权仅清理 14.55GB 未使用 BuildKit 缓存后构建通过，未删除镜像、容器或数据卷。
