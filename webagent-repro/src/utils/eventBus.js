const EventEmitter = require('events');

class BridgeEventBus extends EventEmitter {
  constructor() {
    super();
    this.wsClients = new Set();
    this.logs = [];
    this.maxLogs = 500;
  }

  addWsClient(ws) {
    this.wsClients.add(ws);
    ws.on('close', () => {
      this.wsClients.delete(ws);
    });
  }

  broadcast(type, payload = {}) {
    const eventObj = {
      type,
      timestamp: new Date().toISOString(),
      payload
    };

    this.logs.unshift(eventObj);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }

    const message = JSON.stringify(eventObj);
    for (const ws of this.wsClients) {
      if (ws.readyState === 1) { // OPEN
        try {
          ws.send(message);
        } catch (err) {
          // Ignore write errors to dead sockets
        }
      }
    }

    this.emit(type, payload);
  }

  getRecentLogs(limit = 50) {
    return this.logs.slice(0, limit);
  }
}

const eventBus = new BridgeEventBus();
module.exports = eventBus;
