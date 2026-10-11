'use strict';
// Stable tunnel start failure codes (F130, ShunCode item 18). The message stays the detailed Chinese text for the
// local VS Code sidebar; the code is the contract the browser page renders from its own fixed catalogue, so the page
// never has to echo a host string. Every start rejection in cloudflared.js/ngrok.js/stopProcess.js carries one of these
// codes or an ngrok ERR_NGROK_<n>; anything else is reported as E_TUNNEL_UNKNOWN.
const TUNNEL_START_CODES = Object.freeze([
  'E_NO_CLOUDFLARED', 'E_NO_NGROK',
  'E_NAMED_HOSTNAME', 'E_NAMED_TOKEN', 'E_NGROK_TOKEN', 'E_NGROK_HOSTNAME',
  'E_TUNNEL_SPAWN', 'E_TUNNEL_EXITED', 'E_TUNNEL_TIMEOUT', 'E_TUNNEL_PREVIOUS',
  'E_TUNNEL_CANCELLED', 'E_TUNNEL_SUPERSEDED', 'E_TUNNEL_UNKNOWN'
]);
const NGROK_CODE = /^ERR_NGROK_\d{1,5}$/;

function tunnelFailure(code, message) {
  if (!TUNNEL_START_CODES.includes(code)) throw new Error(`Unregistered tunnel failure code ${code}`);
  const error = new Error(message);
  error.code = code;
  return error;
}

function startFailureCode(error) {
  const code = error && typeof error.code === 'string' ? error.code : '';
  return TUNNEL_START_CODES.includes(code) || NGROK_CODE.test(code) ? code : 'E_TUNNEL_UNKNOWN';
}

module.exports = { TUNNEL_START_CODES, tunnelFailure, startFailureCode };
