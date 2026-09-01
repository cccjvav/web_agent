const express = require('express');
const path = require('path');
const fs = require('fs');
const { config, generateNewSecret } = require('../config');
const { getToolList, callTool, runMultiModelConsensus } = require('../tools');
const { getTaskState, resetTaskState } = require('../tools/progressTracker');
const { executeCommand } = require('../tools/executor');
const eventBus = require('../utils/eventBus');

const router = express.Router();

router.get('/status', (req, res) => {
  res.json({
    status: 'online',
    version: config.version,
    serverName: config.serverName,
    port: config.port,
    secretKey: config.secretKey,
    mcpUrl: `http://127.0.0.1:${config.port}/mcp/${config.secretKey}`,
    workspaceRoot: config.workspaceRoot,
    tools: getToolList(),
    taskState: getTaskState(),
    recentLogs: eventBus.getRecentLogs(50)
  });
});

router.post('/bridge/reset-secret', (req, res) => {
  const oldSecret = config.secretKey;
  const newSecret = generateNewSecret();
  eventBus.broadcast('secret_rotated', { oldSecret, newSecret });
  res.json({ success: true, newSecret, mcpUrl: `http://127.0.0.1:${config.port}/mcp/${newSecret}` });
});

router.post('/consensus/run', async (req, res) => {
  const { taskDescription, files, model } = req.body || {};
  try {
    const result = await runMultiModelConsensus({ taskDescription, files, model });
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/tool/call', async (req, res) => {
  const { name, arguments: toolArgs, mode = 'code' } = req.body || {};
  try {
    eventBus.broadcast('tool_call_start', { tool: name, args: toolArgs, source: `Chat-${mode.toUpperCase()}` });
    const result = await callTool(name, toolArgs, mode);
    eventBus.broadcast('tool_call_end', { tool: name, success: true, result });
    res.json({ success: true, result });
  } catch (err) {
    eventBus.broadcast('tool_call_end', { tool: name, success: false, error: err.message });
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/tasks/reset', (req, res) => {
  const state = resetTaskState();
  res.json({ success: true, taskState: state });
});

module.exports = router;
