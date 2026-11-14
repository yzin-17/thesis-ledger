# 可用来源推荐验收记录

## 实现范围与依据

2026-11-10，在当前未提交工作区验证。推荐纯函数位于 Desktop 的 `routing-recommendation.ts`，使用现有提供方配置、精确目录、配置版本和公共权限展示投影；不会探测远端接口、修改来源启用状态或保存策略。

逐项排除非 `ready`、提供方缺失或停用、配置不完整、凭证缺失，以及权限待确认、失效或配置版本不匹配的候选。按“已配置凭证、当前大类偏好、提供方及接口标识”排序，选择最多两家并明确接口绑定；其余条件相同时的标识排序只保证稳定性，不代表质量排名。大类默认保留仍可用的偏好并补足，所有子项重新生成精确规则，不改变其他大类、范围或可信保留记录。

推荐排序与去重已核对当前 `es-toolkit@1.51.0` 的实际导出、声明、排序实现及官方文档。调用示例为 `uniqBy(orderBy(entries, criteria, ['asc']), entry => entry.target.providerId)`，先排序再保留每家首项。

| 函数                            | 输入与输出                  | 行为与适用步骤                             | 性能依据                               |
| ------------------------------- | --------------------------- | ------------------------------------------ | -------------------------------------- |
| `orderBy`，从 `es-toolkit` 导入 | 对象数组 → 新排序数组       | 多条件升降序，不改输入；用于候选优先级     | 当前实现复制数组后排序，未进行性能基准 |
| `uniqBy`，从 `es-toolkit` 导入  | 数组与映射函数 → 新去重数组 | 依据映射值保留首次出现项；用于按提供方去重 | 避免自行重复实现，未进行性能基准       |

二者分别对应排序和去重，不能互相替代。官方说明：[orderBy](https://es-toolkit.dev/reference/array/orderBy.html)、[uniqBy](https://es-toolkit.dev/reference/array/uniqBy.html)。

## 测试与静态验证

- `pnpm --filter @thesis-ledger/desktop exec vitest run test/routing-recommendation.test.ts test/routing-config-workflow.test.tsx test/routing-source-choices.test.ts test/routing-scope-tree.test.ts test/routing-flat-scopes.test.ts test/routing-capability-options.test.ts`：6 文件、28 项通过，其中 7 项新增推荐测试覆盖无 Key、配置来源优先、免凭证补位、权限过期或版本不符、依赖及准入失败、多接口去重、目录重排确定性、重复采用、精确口径、单源、空配置及输入保护。原先单纯清除例外的测试由新推荐测试承接。
- `pnpm --filter @thesis-ledger/desktop build`：类型检查与生产构建通过，保留现有包体提示。最终输入日志 `/tmp/routing-available-build.log`。
- 修改的推荐、面板和测试 ESLint 通过；相关代码、脚本与文档 Prettier 通过。
- `pnpm exec node scripts/check-boundaries.mjs` 通过；`pnpm exec node scripts/check-file-size-guardrails.mjs` 通过，保留 6 项无关存量大文件警告。

## 实际浏览器与受控无 Key 样本

命令入口为 `pnpm exec node apps/desktop/scripts/check-routing-recommendation.cjs`，设置：

```sh
PLAYWRIGHT_MODULE=/Users/yzin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright
MARKET_ROUTE_CHROMIUM_EXECUTABLE='/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
```

访问实际 Vite `http://localhost:5173/market-data`。四宽 1440、1024、768、390 各运行两种场景：实际配置读取；受控无 Key 响应，令原有需要凭证或已配置凭证的来源不具备凭证配置，并同步把相应目录项标为 `credential_missing`。无 Key 场景仅改变浏览器接收的响应，未清除实际凭证。两种场景的 POST 预览均由实际服务处理，所有 PUT 拦截为受控 503，其他写入禁止透传。

| 场景         | 行情总口径 | 主备覆盖 | 单源 | 未覆盖 | 每宽预览变化 | 每宽受控保存           |
| ------------ | ---------- | -------- | ---- | ------ | ------------ | ---------------------- |
| 当前实际配置 | 71         | 50       | 21   | 0      | 55           | 2 次失败并保留相同请求 |
| 受控无 Key   | 71         | 20       | 45   | 6      | 61           | 2 次失败并保留相同请求 |

每宽同时验证：

- 所有子项有精确规则与接口绑定；其他大类、能力范围不变，已选来源满足配置条件，最多两家且不重复。
- 股票参考逐笔、ETF 参考逐笔、通达信日线包和两种美股指数口径均获得免凭证兜底。
- 确认前保存次数为 0；返回修改保留草稿，两次受控保存请求完全一致。
- 预览结果无来源歧义或不可用项；无 Key 的 6 项缺口如实保留，不扩大覆盖结论。
- 页面无横向溢出、弹窗在视口内，浏览器错误为 0、真实业务写入为 0。

## 截图发现与最终复验

首次截图发现子项已切换接口，但主页面和细分行仍展示已保存规则的旧诊断。面板现于草稿修改后明确显示“草稿待预览，预览后查看覆盖结果”，隐藏旧徽标和异常说明；口径数量改为直接按草稿范围统计。预览后展示对应草稿结果。该修改后重新完成构建、门禁与两场景四宽浏览器验收，并增加旧诊断不再混显的断言。

结果和截图保存在 `/tmp/routing-available-recommendation-qa/`：`results.json`、`main-{configured,no-key}-{1440,1024,768,390}.png`、`children-…` 和 `preview-…`。已实际查看最终 390px 无 Key 主页面、1440px 无 Key 子项，以及受控失败预览截图。

## 证据边界与最终核对

AC1–AC3 由推荐测试及真实预览覆盖，AC4–AC5 由最终四宽交互、请求与截图覆盖。无 Key 是受控响应样本，不等于在全新部署上完成外部服务可达性测试；目录与权限事实不代表本轮已实时请求所有 Provider。

前端由现有 Vite 加载当前源码，未执行 Docker 更新、真实路由保存或 Git 提交。相关主规格已同步当前推荐合同，阶段性旧证据保持原适用范围；最终一致性核对通过，无本范围未完成事项。
