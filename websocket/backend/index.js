const { createServer } = require('http');
const crypto = require('crypto');

const WS_MAGIC_STRING = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const log = console.log;

function generateAcceptHeaders(wsKey) {
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

  return responseHeaders.join('\r\n') + '\r\n\r\n';
}

//  SERVER
const server = createServer((req, res) => {
  log(req);
  res.end('OK');
}).listen(3000, () => log('listening on port', 3000));

server.on('upgrade', (req, socket) => {
  if (req.headers['upgrade'] !== 'websocket') {
    socket.end('HTTP/1.1 400 Bad Request');
    return;
  }

  const wsKey = req.headers['sec-websocket-key'];

  socket.write(generateAcceptHeaders(wsKey));

  socket.on('readable', () => {
    onSocketReadable(socket);
  });

  // socket.on('data', chunk => {});
});

function onSocketReadable(_s) {
  log(' - readable');
  const [b1] = _s.read(1);
  log('b1:', b1.toString(16), '-', b1.toString(2));

  // is first bit 1?
  if (!(b1 & 0x80) === 0x80) {
    // 0x80 = 1000
    log('FIN=0. Message will continue on subsecuent frames');
  }

  const opCode = b1 & 0xf; // 0xF = 1111

  log('opCode ', opCode);

  switch (opCode) {
    case 0x8:
      log(' - connection closed');
      _s.destroy();
      return;
    case 0x0:
      log(' - opCode=0. Message will continue on subsecuent frames');
      break;
    case 0x1:
      log(' - text frame');
      break;
    case 0x2:
      // log(' - binary frame');
      return;
    default:
      return;
  }

  const [b2] = _s.read(1);

  // is first bit 1?
  if (!(b2 & 0x80) === 0x80) {
    log('Message not masked!');
    return;
  }

  let payloadLen = b2 & 0x7f; // 0x7f = 01111111

  if (payloadLen > 125) {
    if (payloadLen === 126) {
      const [_a] = _s.read(1);
      const [_b] = _s.read(1);
      payloadLen = parseInt(_a.toString(2) + _b.toString(2), 2);
    } else {
      // TODO: handle bigger payloads
      log(' * Payload too large');
      return;
    }
  }

  log('b2:', b2);
  log('payloadLen', payloadLen);

  const maskKey = _s.read(4);
  log('maskKey', maskKey);

  const maskedData = _s.read(payloadLen);
  log('encoded', maskedData);

  const data = Buffer.allocUnsafe(payloadLen);
  for (let i = 0; i <= maskedData.length; i++) {
    data[i] = maskedData[i] ^ maskKey[i % 4];
  }

  log('data', data.toString());

  sendResponse(_s);

  let b = _s.read(1);
  if (b) {
    log('excess data');
    while ((b = _s.read(1))) {
      log('  b:', b);
    }
  }
}

function sendResponse(_s) {
  const msg = JSON.stringify({ test: 'response' });
  const msgBuff = Buffer.from(msg);
  const msgLen = msgBuff.byteLength;

  const header = Buffer.allocUnsafe(2);
  header[0] = 0b10000001; // FIN=1 - OpCode=1
  header[1] = msgLen; // TODO: handle bigger payloads

  if (msgLen > 125) {
    // TODO: handle bigger payloads
    log(' * Message too large');
    return;
  }

  _s.write(Buffer.concat([header, msgBuff], 2 + msgLen));
}
