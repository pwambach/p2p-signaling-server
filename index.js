/*
 * A simple WebRTC Signaling Server with Websockets
 * @author <wambach@ubilabs.net>
 * 
 * Message Structure is as follows: 
 * 
 * {
 *   type: 'register|signal|error'
 *   payload: ...
 * }
 * 
 * Payload for the following message types looks like this:
 * 
 * register: 
 * {
 *  id: <string> An arbitrary ID. The ID will be chosen from the client. If an
 *               ID already exists the connection will be closed.
 * }
 * 
 * singal:
 * {
 *   target: <string> The target ID
 *   source: <string> The source ID
 *   type: <string> The type of the signal. One of: 'offer|answer|candidate'
 *   ...specific signal data
 *  }
 *   
 * error:
 * {
 *   message: <string> The error message.
 * }
 *
 */

const WebSocketServer = require('websocket').server;
const http = require('http');

const server = http.createServer((request, response) => {
  response.writeHead(200, {'Content-Type': 'text/plain'});
  response.end('Hello WebRTC Signaling Server');
});

server.listen(8079, () => {
  log('Server is listening on port 8079');
});

const wsServer = new WebSocketServer({
  httpServer: server,
  autoAcceptConnections: false
});

const protocol = 'webrtc-custom-signaling';
const connections = {};
const VALID_MESSAGE_TYPES = ['register', 'signal'];
const messageHandlers = {
  register: handleRegisterMessage,
  signal: handleSignalMessage
};

wsServer.on('request', request => {
  if (!originIsAllowed(request.origin)) {
    request.reject();
    log(`Connection rejected - bad origin: ${request.origin}`);
    return;
  }

  const connection = request.accept(protocol, request.origin);

  log('Connection accepted.');

  connection.on('message', onMessage);
  connection.on('close', onClose);
  connection.on('error', onError);
});

function onMessage(message) {
  const connection = this;

  if (message.type !== 'utf8') {
    return;
  }

  const {type, payload} = JSON.parse(message.utf8Data);

  if (!VALID_MESSAGE_TYPES.includes(type) || !payload) {
    return;
  }

  messageHandlers[type](connection, payload);
}

function handleRegisterMessage(connection, payload) {
  const id = payload.id.slice(0, 5);

  if (connections[id]) {
    log(`Connection ID ${id} already exists. Closing connection.`);
    connection.close();
    return;
  }

  connections[id] = connection;

  const numberOfConnections = Object.keys(connections).length;
  log(`Connection registered: ${id} (total ${numberOfConnections})`);
}

function handleSignalMessage(connection, payload) {
  const {source, target} = payload;
  const targetConnection = connections[target];
  const sourceConnection = connections[source];

  if (sourceConnection !== connection) {
    log('Incorrect source id. Closing connection.');
    connection.close();
    return;
  }

  if (!targetConnection) {
    const response = {
      type: 'error',
      message: `Connection ${target} unknown`
    };

    log(response.message);
    connection.sendUTF(JSON.stringify(response));
    return;
  }

  targetConnection.sendUTF(JSON.stringify(payload));
}

function onClose(reasonCode, description) {
  const connection = this;
  const id = getIdFromConnection(connection);
  delete connections[id];

  log(`Connection ${id} disconnected (${reasonCode}: ${description})`);
}

function onError(error) {
  const connection = this;
  const id = getIdFromConnection(connection);
  log(`Connection ${id} error: `, error);
}

// edit for your needs
function originIsAllowed(origin) {
  return [
    'http://localhost',
    'http://192.168',
    'https://webar-spectator.now.sh'
  ].some(valid => origin.startsWith(valid));
}

function getIdFromConnection(connection) {
  const [id] = Object.entries(connections).find(
    ([, conn]) => conn === connection
  );

  return id;
}

function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp}: ${message}`);
}
