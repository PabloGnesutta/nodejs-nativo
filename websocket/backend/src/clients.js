const { log } = require('./utils/utils');

const WS_MAX_RESPONSE_LENGTH = 65535;

const clients = [];
const sockets = [];

let idCount = 0;

const registerClient = _s => {
  const clientId = ++idCount;

  sockets.push(_s);
  clients.push(clientId);

  _s.on('readable', () => readSocket(_s, clientId));
  // _s.on('data', chunk => {});
};

const broadcast = (msg, channel) => {
  sockets.forEach(_s => {
    sendMessage(_s, msg);
  });
};

/**
 *
 * @param {Socket} _s
 * @returns {void}
 */
function readSocket(_s, clientId) {
  const [b1] = _s.read(1);

  // if first bit=1, this is the final frame of the current message
  if (!(b1 & 0x80) === 0x80) {
    // 0x80=1000
    log('FIN=0. Message will continue on subsecuent frames');
  }

  const opCode = b1 & 0xf; // 0xF=1111
  log('opCode ', opCode);

  switch (opCode) {
    case 0x0:
      log(' - opCode=0. Message will continue on subsecuent frames');
      break;
    case 0x1:
      log(' - Text frame');
      break;
    case 0x2:
      log(' - Binary frame: not supported');
      _s.destroy();
      return;
    case 0x8:
      log(' - Connection closed');
      _s.destroy();
      return;
    default:
      log(' - opCode not supported: ', opCode);
      _s.destroy();
      return;
  }

  const [b2] = _s.read(1);

  // if first bit=1, message is masked
  if (!(b2 & 0x80) === 0x80) {
    log('Message not masked!');
    return;
  }

  // 7 bits
  let payloadLen = b2 & 0x7f; // 0x7f=01111111

  if (payloadLen > 125) {
    if (payloadLen === 126) {
      // 16 bits
      const [_a] = _s.read(1);
      const [_b] = _s.read(1);
      payloadLen = parseInt(_a.toString(2) + _b.toString(2), 2);
    } else {
      // 64 bits messages not supported
      log(' * Payload too large');
      return;
    }
  }

  const maskKey = _s.read(4);
  const maskedData = _s.read(payloadLen);

  const unmaskedData = Buffer.allocUnsafe(payloadLen);
  for (let i = 0; i <= maskedData.length; i++) {
    unmaskedData[i] = maskedData[i] ^ maskKey[i % 4];
  }

  try {
    const jsonData = JSON.parse(unmaskedData);
    log('jsonData', jsonData);

    sendMessage(_s, { type: 'ACKNOWLEDGE' });

    if (jsonData.type === 'broadcast from client') {
      broadcast({ type: ' * MEGA BROADCAST * ' });
    }
  } catch (error) {
    return log('Invalid JSON:', unmaskedData);
  }

  // Excess data. Should never reach here.
  let b = _s.read(1);
  if (b) {
    log('excess data');
    while ((b = _s.read(1))) {
      log('  b:', b);
    }
  }
}

/**
 *
 * @param {Socket} _s
 * @param {JSON} _msg
 * @returns {void}
 */
function sendMessage(_s, _msg) {
  const msg = JSON.stringify(_msg);

  const msgBuff = Buffer.from(msg);
  const msgLen = msgBuff.byteLength;
  log('msgLen', msgLen);

  let header;
  let lenByte = msgLen;
  if (msgLen > 125) {
    if (msgLen < WS_MAX_RESPONSE_LENGTH) {
      // 16 bits
      lenByte = 126;
      header = Buffer.allocUnsafe(4);
    } else {
      // 64 bits messages not supported
      log('Response message too large');
      return;
    }
  } else {
    // 7 bits
    header = Buffer.allocUnsafe(2);
  }
  log('lenbyte', lenByte);

  header.writeUInt8(0b10000001, 0); // FIN=1 - OpCode=1
  header.writeUInt8(lenByte, 1);

  if (lenByte === 126) {
    // Extended length
    header.writeInt16BE(msgLen, 2);
  }

  _s.write(Buffer.concat([header, msgBuff]));
}

module.exports = {
  clients,
  broadcast,
  registerClient,
};
