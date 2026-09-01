const { config, generateNewSecret } = require('../config');
const eventBus = require('../utils/eventBus');

function validateSecret(req, res, next) {
  const reqSecret = req.params.secret || req.headers['x-mcp-secret'] || req.query.secret;

  if (!reqSecret || reqSecret !== config.secretKey) {
    return res.status(401).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Unauthorized: Invalid or expired ShunCode Bridge MCP secret token.'
      },
      id: req.body ? req.body.id : null
    });
  }

  next();
}

function rotateSecret() {
  const oldSecret = config.secretKey;
  const newSecret = generateNewSecret();
  eventBus.broadcast('secret_rotated', {
    oldSecret,
    newSecret,
    timestamp: new Date().toISOString()
  });
  return newSecret;
}

module.exports = {
  validateSecret,
  rotateSecret
};
