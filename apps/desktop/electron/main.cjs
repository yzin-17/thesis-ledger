const { app, BrowserWindow, shell } = require('electron');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);
const apiBaseUrl = (process.env.THESIS_LEDGER_API_URL || 'http://127.0.0.1:3000').replace(
  /\/$/u,
  '',
);
let appServer;

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const writeError = (response, status, message) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify({ message }));
};

const startAppServer = async () => {
  const distRoot = path.resolve(__dirname, '..', 'dist');
  appServer = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
    if (requestUrl.pathname.startsWith('/api/')) {
      try {
        const upstream = await fetch(`${apiBaseUrl}${requestUrl.pathname}${requestUrl.search}`, {
          method: request.method,
          headers: request.headers,
          body: ['GET', 'HEAD'].includes(request.method || 'GET') ? undefined : request,
          duplex: 'half',
        });
        response.writeHead(upstream.status, Object.fromEntries(upstream.headers.entries()));
        response.end(Buffer.from(await upstream.arrayBuffer()));
      } catch (error) {
        writeError(response, 502, `ThesisLedger API unavailable: ${error.message}`);
      }
      return;
    }

    const requestedPath = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
    const safePath = path.normalize(requestedPath).replace(/^\.{2}(\/|\\)/u, '');
    const filePath = path.join(distRoot, safePath);
    const resolvedRoot = `${distRoot}${path.sep}`;
    if (!filePath.startsWith(resolvedRoot)) {
      writeError(response, 400, 'Invalid asset path');
      return;
    }
    try {
      const file = await fs.promises.readFile(filePath);
      response.writeHead(200, {
        'content-type': contentTypes[path.extname(filePath)] || 'application/octet-stream',
      });
      response.end(file);
    } catch {
      const fallback = await fs.promises.readFile(path.join(distRoot, 'index.html'));
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(fallback);
    }
  });
  await new Promise((resolve) => appServer.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${appServer.address().port}`;
};

const createWindow = async () => {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 520,
    minHeight: 520,
    backgroundColor: '#101312',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const url = isDevelopment ? process.env.VITE_DEV_SERVER_URL : await startAppServer();
  await window.loadURL(url);
  window.webContents.setWindowOpenHandler(({ url: externalUrl }) => {
    if (/^https?:/u.test(externalUrl)) void shell.openExternal(externalUrl);
    return { action: 'deny' };
  });
  return window;
};

app.whenReady().then(async () => {
  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  appServer?.close();
});
