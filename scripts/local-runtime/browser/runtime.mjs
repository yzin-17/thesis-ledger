import { createRequire } from 'node:module';
import { createServer as createSocketServer } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
export const root = fileURLToPath(new URL('../../../', import.meta.url));
const desktop = resolve(root, 'apps/desktop');
const mobile = resolve(root, 'apps/mobile');
const vite = () => import(pathToFileURL(require.resolve('vite', { paths: [desktop] })).href);
const webExtensions = ['.web.mjs', '.web.js', '.web.ts', '.web.tsx', '.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'];
async function availablePort() {
  const socket = createSocketServer();
  await new Promise((done, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', done); });
  const port = socket.address().port;
  await new Promise((done, reject) => socket.close((error) => error ? reject(error) : done()));
  return port;
}

export async function createDesktopHost(cacheDir, { aliases = [], entries = [] } = {}) {
  const { createServer, loadConfigFromFile } = await vite();
  const { config } = await loadConfigFromFile({ command: 'serve', mode: 'test' }, resolve(desktop, 'vite.config.ts'));
  const server = await createServer({
    ...config,
    root: desktop,
    configFile: false,
    cacheDir,
    logLevel: 'error',
    define: { __DEV__: 'false', global: 'globalThis', 'process.env': JSON.stringify({ NODE_ENV: 'development', EXPO_OS: 'web' }) },
    resolve: {
      extensions: webExtensions,
      dedupe: ['react', 'react-dom'],
      alias: [
        ...aliases,
        { find: '@', replacement: resolve(desktop, 'src') },
        { find: /^react-native$/, replacement: require.resolve('react-native-web', { paths: [mobile] }) },
        { find: '/__mobile-arena-live-entry__', replacement: resolve(mobile, 'test/browser-instrument-multiselect-mobile.tsx') },
        { find: '/__mobile-multiselect-entry__', replacement: resolve(mobile, 'test/browser-multiselect.tsx') },
        { find: /^(?:\.\.\/)+(?:app\/)?MobileRuntime$/, replacement: resolve(mobile, 'test/browser-risk-notification-runtime.ts') },
      ],
    },
    optimizeDeps: { esbuildOptions: { resolveExtensions: webExtensions }, entries: entries.length ? entries : [
      'test/browser-arena-live-mobile.html', 'test/browser-multiselect.html',
      'test/browser-multiselect-mobile.html', 'test/browser-strategy-rule-notification.html',
      'test/browser-provider-health-history.html',
    ] },
    server: { host: '127.0.0.1', port: await availablePort(), strictPort: true, proxy: {}, fs: { allow: [root] } },
  });
  try {
    await server.listen();
    return { server, origin: `http://127.0.0.1:${server.httpServer.address().port}` };
  } catch (error) {
    await server.close();
    throw error;
  }
}

export async function createRiskMobileHost(output) {
  const { createServer } = await vite();
  const server = await createServer({
    configFile: false,
    root: mobile,
    logLevel: 'error',
    define: { __DEV__: 'false', global: 'globalThis', 'process.env': JSON.stringify({ NODE_ENV: 'development', EXPO_OS: 'web' }) },
    cacheDir: resolve(output, 'vite-cache'),
    optimizeDeps: { entries: ['test/browser-risk-notification.html'], esbuildOptions: { resolveExtensions: webExtensions } },
    resolve: {
      extensions: webExtensions,
      dedupe: ['react', 'react-dom'],
      alias: [
        { find: /^react-native$/, replacement: require.resolve('react-native-web', { paths: [mobile] }) },
        { find: /^(?:\.\.\/)+(?:app\/)?MobileRuntime$/, replacement: resolve(mobile, 'test/browser-risk-notification-runtime.ts') },
      ],
    },
    esbuild: { jsx: 'automatic' },
    server: { host: '127.0.0.1', port: await availablePort(), strictPort: true, fs: { allow: [root] } },
  });
  try {
    await server.listen();
    return { server, mobileOrigin: `http://127.0.0.1:${server.httpServer.address().port}` };
  } catch (error) {
    await server.close();
    throw error;
  }
}

export async function launchRegressionBrowser() {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.BROWSER_REGRESSION_CHANNEL ?? 'chromium',
  });
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async (options) => {
    const page = await newPage(options);
    page.on('pageerror', (error) => console.error(`页面错误：${error.stack ?? error.message}`));
    page.on('console', (message) => { if (message.type() === 'error') console.error(`浏览器：${message.text()}`); });
    // 用例级路由优先；未登记 API 和外部来源默认阻断。
    await page.context().route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname.startsWith('/api/')) {
        return route.abort('blockedbyclient');
      }
      return route.continue();
    });
    return page;
  };
  return browser;
}
