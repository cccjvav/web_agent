'use strict';
const external = require('../src/mcp/externalClient');
const path = require('path');
const preview = external.previewStdio({ program: process.execPath, args: [path.join(__dirname, 'stdioServerFixture.js'), 'tree'] });
external.startStdio({ previewId: preview.previewId, confirmed: true }).then(server => {
  process.send({ serverId: server.serverId });
}).catch(() => { process.exitCode = 1; process.disconnect(); });
