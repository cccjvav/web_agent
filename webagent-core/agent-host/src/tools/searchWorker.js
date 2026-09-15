'use strict';
const { workerData, parentPort } = require('worker_threads');
const { config } = require('../config');
config.workspaceRoot = workerData.workspaceRoot;
const { scanSearch } = require('./fileOps');
// Load modules before readiness; do not scan until the parent starts the compute budget.
parentPort.once('message', message => {
  if (!message || message.type !== 'start') return;
  try {
    const result = scanSearch(workerData.args);
    parentPort.postMessage({ result });
  } catch (err) {
    parentPort.postMessage({ error: { message: err.message, code: err.code } });
  }
});
parentPort.postMessage({ ready: true });
