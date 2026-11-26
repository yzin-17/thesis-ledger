# 界面回归

入口：`pnpm test:browser-regressions`。目录由 [cases.mjs](cases.mjs) 登记 7 项回归，按 `instruments`、`providers`、`risk` 分组；测试实际组件和固定样本，覆盖 1440、1024、768、390 代表宽度、横向溢出及原有交互。移动页面使用 React Native Web，不替代原生编译或真机验收。

## 准备与运行

使用 Node.js 24 和仓库依赖。首次执行先构建依赖并安装与锁文件一致的浏览器：

```sh
pnpm --filter '@thesis-ledger/desktop^...' build
pnpm exec playwright install --with-deps --no-shell chromium
pnpm test:browser-regressions
pnpm test:browser-regressions --list
pnpm test:browser-regressions --group risk
pnpm test:browser-regressions --case provider-health-record
```

默认使用 Chromium；本机已有兼容浏览器时，可显式设置 `BROWSER_REGRESSION_CHANNEL=msedge` 等 Playwright 渠道。CI 安装固定 Playwright 对应的 Chromium 并执行全部 7 项，不依赖机器已有浏览器。

## 输出与隔离

默认输出为系统临时目录 `thesis-ui-regressions-*`；`--output <空目录>` 可指定新目录。根 `report.json` 汇总结果，各用例目录保存 `run.log`、截图及 JSON 明细；失败仍保留证据。单用例最长 5 分钟，失败后继续其他用例；收到终止信号后停止后续用例并关闭自身服务。

入口自行建立仅监听回环地址的 Vite 服务，使用临时空闲端口和独立缓存，不连接原开发服务。测试用例拦截 API，默认阻断未登记 API 和外部来源，提供方历史使用固定 40 条样本验证分页；不会调用模型、真实通知或业务数据库。服务和浏览器在结束时关闭，证据目录保留供检查。

维护回归时同步更新宿主页和受控样本，保留断言覆盖；不要用修改业务 UI、缩减宽度或忽略失败让整理通过。若产品合同变化，按实际组件更新样本及断言并记录原因。禁止把固定样本通过结论扩大为真实来源或业务环境验收。
