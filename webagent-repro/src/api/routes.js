const express = require('express');
const path = require('path');
const fs = require('fs');
const { config } = require('../config');
const { rotateSecret } = require('../mcp/auth');
const tunnelManager = require('../tunnel/tunnelManager');
const { getToolList, callTool } = require('../mcp/tools');
const { getTaskState, resetTaskState } = require('../mcp/tools/progressTracker');
const { executeCommand } = require('../mcp/tools/executor');
const eventBus = require('../utils/eventBus');

const router = express.Router();

/**
 * Get comprehensive system status
 */
router.get('/status', (req, res) => {
  const tunnelStatus = tunnelManager.getStatus();
  res.json({
    bridge: {
      ...tunnelStatus,
      port: config.port,
      version: config.version,
      serverName: config.serverName
    },
    workspace: {
      root: config.workspaceRoot,
      relRoot: path.basename(config.workspaceRoot)
    },
    tools: getToolList(),
    taskState: getTaskState(),
    recentLogs: eventBus.getRecentLogs(30)
  });
});

/**
 * Tunnel controls
 */
router.post('/bridge/start', async (req, res) => {
  const { provider = 'quick', host } = req.body || {};
  const status = await tunnelManager.startTunnel(provider, host);
  res.json(status);
});

router.post('/bridge/stop', (req, res) => {
  const status = tunnelManager.stopTunnel();
  res.json(status);
});

router.post('/bridge/rotate-secret', (req, res) => {
  const newSecret = rotateSecret();
  res.json({
    success: true,
    newSecret,
    tunnelStatus: tunnelManager.getStatus()
  });
});

router.post('/task/reset', (req, res) => {
  const cleared = resetTaskState();
  res.json({ success: true, taskState: cleared });
});

/**
 * Workspace file operations for Web IDE
 */
router.get('/workspace/tree', (req, res) => {
  try {
    const listDirTool = require('../mcp/tools/fileOps').listDir;
    const result = listDirTool({ dirPath: '.', recursive: true, maxDepth: 4 });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/workspace/file', (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'path parameter required' });

  try {
    const fullPath = path.resolve(config.workspaceRoot, filePath);
    if (!fullPath.startsWith(config.workspaceRoot)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    const content = fs.readFileSync(fullPath, 'utf8');
    res.json({ filePath, content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/workspace/file', (req, res) => {
  const { path: filePath, content } = req.body;
  if (!filePath || content === undefined) {
    return res.status(400).json({ error: 'path and content required' });
  }

  try {
    const fullPath = path.resolve(config.workspaceRoot, filePath);
    if (!fullPath.startsWith(config.workspaceRoot)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
    res.json({ success: true, filePath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Test Runner API
 */
router.post('/workspace/run-tests', async (req, res) => {
  try {
    const result = await executeCommand({
      command: 'npm test',
      cwd: '.',
      timeoutSec: 15
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Built-in Agent Simulator
 */
router.post('/simulator/call', async (req, res) => {
  const { tool, arguments: toolArgs } = req.body;
  if (!tool) return res.status(400).json({ error: 'Tool name required' });

  try {
    eventBus.broadcast('simulator_call', { tool, args: toolArgs });
    const result = await callTool(tool, toolArgs);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
