const { Readable } = require('node:stream');

const pipeUpstreamResponse = (upstream, response, onDisconnect) => {
  response.writeHead(upstream.status, Object.fromEntries(upstream.headers.entries()));
  if (!upstream.body) {
    response.end();
    return;
  }

  const body = Readable.fromWeb(upstream.body);
  response.once('close', () => {
    if (!response.writableEnded) {
      body.destroy();
      onDisconnect();
    }
  });
  body.once('error', (error) => response.destroy(error));
  body.pipe(response);
};

module.exports = { pipeUpstreamResponse };
