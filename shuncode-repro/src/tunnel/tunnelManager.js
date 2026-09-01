const { spawn, execSync } = require('child_process');
const { config } = require('../config');
const eventBus = require('../utils/eventBus');

class TunnelManager {
  constructor() {
    this.process = null;
    this.publicUrl = null;
    this.status = 'offline'; // 'offline' | 'starting' | 'online' | 'error'
    this.provider = 'quick'; // 'quick' | 'named' | 'ngrok' | 'local'
    this.error = null;
  }

  isCloudflaredAvailable() {
    try {
      execSync('cloudflared --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  async startTunnel(provider = 'quick', customHost = null) {
    this.provider = provider;
    this.status = 'starting';
    this.error = null;
    eventBus.broadcast('tunnel_status', this.getStatus());

    if (provider === 'local') {
      this.publicUrl = `http://127.0.0.1:${config.port}`;
      this.status = 'online';
      config.tunnelUrl = this.publicUrl;
      eventBus.broadcast('tunnel_status', this.getStatus());
      return this.getStatus();
    }

    if (this.isCloudflaredAvailable()) {
      try {
        const args = ['tunnel', '--url', `http://127.0.0.1:${config.port}`];
        this.process = spawn('cloudflared', args);

        this.process.stderr.on('data', (data) => {
          const text = data.toString();
          // Look for https://*.trycloudflare.com
          const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
          if (match && !this.publicUrl) {
            this.publicUrl = match[0];
            this.status = 'online';
            config.tunnelUrl = this.publicUrl;
            eventBus.broadcast('tunnel_status', this.getStatus());
          }
        });

        this.process.on('close', (code) => {
          this.status = 'offline';
          this.publicUrl = null;
          eventBus.broadcast('tunnel_status', this.getStatus());
        });

        return this.getStatus();
      } catch (err) {
        this.error = err.message;
        this.status = 'error';
        eventBus.broadcast('tunnel_status', this.getStatus());
        return this.getStatus();
      }
    } else {
      // Direct local / preview host fallback
      this.publicUrl = `http://127.0.0.1:${config.port}`;
      this.status = 'online';
      config.tunnelUrl = this.publicUrl;
      eventBus.broadcast('tunnel_status', this.getStatus());
      return this.getStatus();
    }
  }

  stopTunnel() {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
    this.status = 'offline';
    this.publicUrl = null;
    eventBus.broadcast('tunnel_status', this.getStatus());
    return this.getStatus();
  }

  getStatus() {
    return {
      status: this.status,
      provider: this.provider,
      publicUrl: this.publicUrl,
      mcpEndpoint: this.publicUrl ? `${this.publicUrl}/mcp/${config.secretKey}` : null,
      secretKey: config.secretKey,
      hasCloudflared: this.isCloudflaredAvailable()
    };
  }
}

const tunnelManager = new TunnelManager();
module.exports = tunnelManager;
