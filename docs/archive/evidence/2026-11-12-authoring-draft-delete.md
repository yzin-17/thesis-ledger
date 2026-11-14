# 策略草稿列表删除验收

## 交付行为

- Desktop 自然语言创建页的草稿提供“编辑”入口；编写中草稿同时提供“删除”按钮，确认弹窗显示草稿名称与操作后果，取消不发送请求。
- 复用现有 `discardDraft` 接口及修订校验，保留历史调用记录；服务端在分页查询前排除 `discarded`，刷新后不会重新出现。
- 删除成功后更新全部已加载页并刷新列表；失败保留原条目并显示错误。请求期间禁用重复删除、新建与打开草稿。
- 编辑页的草稿操作菜单提供“复制本地草稿”，保留复制成功、失败重试与在途禁用反馈。已保存条目保留原有打开行为。

## 验证结果

| 检查             | 命令或范围                                                                                                                                  | 结果                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Desktop 编写模块 | `pnpm --filter @thesis-ledger/desktop exec vitest run test/authoring`                                                                       | 9 文件、55 项通过；包含取消、删除成功、失败及等待状态。测试有 React `act` 与宿主存储提示，未作为浏览器结论 |
| Server 前置约束  | `pnpm --filter @thesis-ledger/server exec vitest run test/strategy-authoring/draft.repository.test.ts`                                      | 4 项通过                                                                                                   |
| 隔离 PostgreSQL  | `node scripts/test-journal-review-postgres.mjs test/strategy-authoring/authoring-postgres.integration.test.ts`                              | 14 项通过；验证删除项不占分页名额、不会返回列表，原记录仍可读取；临时容器已清理                            |
| 类型与构建       | Desktop、Server `typecheck`；Desktop `build`；隔离入口执行 Server 与依赖构建                                                                | 通过                                                                                                       |
| 静态门禁         | 修改文件 ESLint；`node scripts/check-boundaries.mjs`；`node scripts/check-file-size-guardrails.mjs`；`git diff --check`                     | 通过；尺寸门禁另有 6 条既有文件警告                                                                        |
| 受控浏览器       | `PLAYWRIGHT_MODULE=/tmp/codex-market-range-qa/node_modules/playwright pnpm exec node apps/desktop/scripts/check-authoring-draft-delete.cjs` | Edge 的 1440、1024、768、390 宽度通过；取消、失败重试、等待禁用、成功移除及刷新保持，无页面错误和横向溢出  |
| 真实页面只读     | 同上加 `--live-readonly`                                                                                                                    | 四宽度通过，检查真实列表不含已丢弃项、按钮聚焦、确认弹窗与取消；真实业务写请求为 0                         |

浏览器截图与回执位于 `/tmp/authoring-draft-delete-qa/`，受控样本与真实页面证据分别保存。没有删除任何真实草稿。

草稿入口调整后重新通过 Desktop 55 项测试、修改文件 ESLint、类型检查与构建。四宽度的受控样本和真实只读页面均验证“编辑”进入草稿、菜单只提供复制、返回列表和删除原流程，无页面错误或横向溢出；截图为 `editor-<宽度>.png` 与 `live-editor-<宽度>.png`。

隔离入口首次因 Context Mode 的 `PATH` 缺少 Docker 失败；补齐路径后遇到一次 Server 构建输出目录 `ENOTEMPTY`，检查无活动构建后再次运行通过。首次日志检查使用了错误容器简称，随后按 `docker ps` 返回的真实名称复查。

## 本地运行同步

- 执行目录：`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`。
- 正式入口：`./scripts/sync-code.sh thesis-ledger`，无额外行为参数，退出码 0。
- Server 与 `backtest-worker` 健康；同步后四宽度真实页面只读检查通过。
- 本次为容器可写层代码更新，镜像 ID 保持不变；脚本未执行数据库结构或外部卷变更，容器重建后需重新同步。
- 后续草稿入口调整仅涉及 Desktop，在当前宿主 Vite 页面直接生效；Server 源码输入未变，复用上述隔离数据库与运行同步结果。
