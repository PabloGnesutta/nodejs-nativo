const crypto = require('crypto');
const { createServer } = require('http');
const { log } = require('./utils/utils');
const { registerClient } = require('./clients');

// -------
// SERVER:

const server = createServer((req, res) => {
  log(req);
  res.end('OK');
});

server.listen(3000, () => log('listening on port', 3000));

// ------------------------------
// UPGRADE to WebSocket Protocol:

const WS_MAGIC_STRING = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

server.on('upgrade', (req, socket) => {
  if (req.headers['upgrade'] !== 'websocket') {
    return socket.end('HTTP/1.1 400 Bad Request\r\n');
  }

  const wsKey = req.headers['sec-websocket-key'];

  const wsAccept = crypto
    .createHash('sha1')
    .update(wsKey + WS_MAGIC_STRING)
    .digest('base64');

  const responseHeaders = [
    'HTTP/1.1 101 Web Socket Protocol Handshake',
    'Upgrade: WebSocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${wsAccept}`,
  ];

  socket.write(responseHeaders.join('\r\n') + '\r\n\r\n');

  registerClient(socket);
});
