const fs = require('node:fs');
const path = require('node:path');

module.exports = function chartSourcePlugin({ types }) {
  return {
    visitor: {
      CallExpression(call) {
        if (!types.isIdentifier(call.node.callee, { name: '__MOBILE_CHART_LIBRARY__' })) return;
        const source = fs.readFileSync(
          path.join(
            __dirname,
            'node_modules/lightweight-charts/dist/lightweight-charts.standalone.production.js',
          ),
          'utf8',
        );
        call.replaceWith(types.stringLiteral(source));
      },
    },
  };
};
