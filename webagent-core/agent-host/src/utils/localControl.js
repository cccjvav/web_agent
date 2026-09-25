const { config } = require('../config');

function isLoopbackAddress(addr) {
  const a = String(addr || '').trim().toLowerCase();
  if (!a) return false;
  if (a === '::1' || a === 'localhost') return true;
  const v4 = a.replace(/^::ffff:/, '');
  return v4 === '127.0.0.1';
}

// Reverse-proxy forwarding headers. A local browser, the VS Code extension and the CLI never send
// them, but a proxy that rewrites Host to localhost does: `ngrok http --host-header=rewrite` (or
// --host-header=localhost:PORT, a common tutorial fix) connects from 127.0.0.1 with Host localhost
// and no cf-* headers, and records the public host in X-Forwarded-Host (ngrok v3) plus
// X-Forwarded-For. Presence alone is enough; the values are client-controlled and never trusted.
const FORWARDING_HEADERS = ['x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'forwarded', 'x-real-ip', 'x-original-host'];

function isTunnelRequest(req) {
  const h = (req && req.headers) || {};
  return Boolean(
    h['cf-ray']
    || h['cf-connecting-ip']
    || h['cf-visitor']
    || h['cf-ew-via']
    || h['cdn-loop']
  ) || FORWARDING_HEADERS.some(name => h[name] !== undefined);
}

function hostName(req) {
  const host = String((req && req.headers && req.headers.host) || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  return host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
}

function publicTunnelHost() {
  const raw = String((config && config.publicTunnelUrl) || '').trim().toLowerCase();
  if (!raw) return '';
  return raw.replace(/^https?:\/\//, '').split('/')[0].replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
}

function isPublicHost(req) {
  const name = hostName(req);
  if (!name) return false;
  if (name === 'localhost' || name === '127.0.0.1' || name === '::1') return false;
  if (name.endsWith('.trycloudflare.com')) return true;
  if (name.endsWith('.ngrok-free.app') || name.endsWith('.ngrok.io') || name.endsWith('.ngrok.app') || name.endsWith('.ngrok.dev')) return true;
  const pub = publicTunnelHost();
  if (pub && name === pub) return true;
  return false;
}

function isLocalControlPlane(req) {
  if (isTunnelRequest(req)) return false;
  // A loopback socket alone is not proof of a local browser origin (DNS rebinding).
  const host = String((req && req.headers && req.headers.host) || '');
  const localHost = /^(localhost|127\.0\.0\.1|\[::1\])(?::([0-9]{1,5}))?$/i.exec(host);
  if (!localHost || (localHost[2] && (Number(localHost[2]) < 1 || Number(localHost[2]) > 65535))) return false;
  if (isPublicHost(req)) return false;
  const ip = (req && req.socket && req.socket.remoteAddress) || (req && req.ip);
  return isLoopbackAddress(ip);
}

function rejectUnlessLocalControl(req, res, next) {
  if (isLocalControlPlane(req)) return next();
  return res.status(404).json({ error: 'not found' });
}

module.exports = {
  isLoopbackAddress,
  isTunnelRequest,
  isPublicHost,
  isLocalControlPlane,
  rejectUnlessLocalControl
};
