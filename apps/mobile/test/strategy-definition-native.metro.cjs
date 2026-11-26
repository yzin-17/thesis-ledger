const path = require('node:path');
const { createRequire } = require('node:module');
const { getDefaultConfig } = require('expo/metro-config');
const root = path.resolve(__dirname, '..');
const config = getDefaultConfig(root);
const dependencyRequire = createRequire(require.resolve('babel-preset-expo'));
config.server.port = 8083;
const isolatedStorage = path.join(__dirname, 'native-strategy-definition-storage.ts');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('@babel/runtime/'))
    return { type: 'sourceFile', filePath: dependencyRequire.resolve(moduleName) };
  if (
    moduleName === '@react-native-async-storage/async-storage' &&
    context.originModulePath !== isolatedStorage
  )
    return { type: 'sourceFile', filePath: isolatedStorage };
  if (moduleName.includes('.virtual-metro-entry'))
    return {
      type: 'sourceFile',
      filePath: path.join(__dirname, 'native-strategy-definition-editor.tsx'),
    };
  return context.resolveRequest(context, moduleName, platform);
};
const enhance = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (middleware, server) => {
  const next = enhance ? enhance(middleware, server) : middleware;
  return (req, res, done) => {
    if (req.url === '/status') {
      res.end('packager-status:running');
      return;
    }
    if (req.url?.startsWith('/.expo/.virtual-metro-entry.bundle'))
      req.url = req.url.replace(
        '/.expo/.virtual-metro-entry.bundle',
        '/apps/mobile/test/native-strategy-definition-editor.bundle',
      );
    return next(req, res, done);
  };
};
module.exports = config;
