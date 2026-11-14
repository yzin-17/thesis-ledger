# 实验候选采纳弹窗验收

日期：2026-11-12。对应[当前规格](../../specs/2026-11-12-experiment-result-adoption.md)。

## 结果

“审阅并采纳”使用共享 Dialog，加载、读取失败重试和完整策略差异均在弹窗中展示。长差异内部滚动，标题与底部操作保持可见；取消或 Esc 关闭后焦点返回对应候选按钮。提交等待时禁用取消与确认、隐藏关闭按钮并阻止 Esc 关闭；提交失败保留审阅弹窗。

复用现有共享组件和 Tailwind 原子类，修正平板宽度下弹窗宽度上限造成的溢出，未改动全局 Dialog 样式或采纳接口。

## 验证

- `pnpm --filter @thesis-ledger/desktop typecheck`：通过。
- 相关三个页面与组件文件定向 ESLint：通过。
- `pnpm --filter @thesis-ledger/desktop test test/strategy-experiment-detail.test.ts test/strategy-experiment-candidate-diff.test.tsx`：2 个文件、10 项通过。
- `pnpm --filter @thesis-ledger/desktop build`：通过。
- 实际浏览器访问本地 Desktop 开发运行态 `http://localhost:5173`，使用实验 `71bbc0a2-89ae-48eb-938f-0b7e534aecb2` 的只读响应，在 1440、1024、768、390 宽度分别打开两个候选，验证弹窗边界、内部滚动、底部按钮可见、取消、Esc 和焦点返回；无页面横向溢出或 JavaScript 错误。桌面和窄屏截图完成目视检查。
- 390 宽度受控请求验证：首次审阅读取返回 503，弹窗内可重试；采纳请求被浏览器拦截并挂起，验证提交保护后返回受控 409，审阅弹窗仍保留并可取消。该采纳请求未发送到服务端。

浏览器脚本：`/tmp/verify-experiment-adoption-dialog.cjs`。结果和截图：`/tmp/experiment-adoption-dialog-qa/`。这些是本地临时验证产物，未纳入仓库。

真实数据只读，浏览器验证没有向服务端发送业务写请求，没有新增模型调用。此项仅修改 Desktop 前端，未进行 Docker 更新或镜像发布。
