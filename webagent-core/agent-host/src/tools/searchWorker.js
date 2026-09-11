'use strict';
const { workerData, parentPort } = require('worker_threads');
const { config } = require('../config');
config.workspaceRoot = workerData.workspaceRoot;
try {
  const result = require('./fileOps').scanSearch(workerData.args);
  parentPort.postMessage({ result });
} catch (err) {
  parentPort.postMessage({ error: { message: err.message, code: err.code } });
}
