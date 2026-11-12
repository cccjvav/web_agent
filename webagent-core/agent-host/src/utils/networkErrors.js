'use strict';
// Network failure layer by Node/undici error code (F130 for external MCP, shared with model requests in F131).
// Codes are stable across Node versions, messages are not, so no message text is matched. The cause chain is
// walked because fetch wraps the socket error ("fetch failed" -> cause.code). Proxy codes are omitted: the
// host uses no proxy.
const NETWORK_CODES = Object.freeze({
  dns: Object.freeze(['ENOTFOUND', 'EAI_AGAIN', 'EAI_FAIL', 'EAI_NONAME', 'EAI_NODATA']),
  connect: Object.freeze(['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE', 'ECONNABORTED', 'UND_ERR_SOCKET']),
  timeout: Object.freeze(['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT']),
  certificate: Object.freeze(['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'CERT_HAS_EXPIRED',
    'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'ERR_TLS_CERT_ALTNAME_INVALID', 'CERT_NOT_YET_VALID', 'UNABLE_TO_GET_ISSUER_CERT'])
});

function networkCategory(error) {
  for (let current = error, depth = 0; current && depth < 5; current = current.cause, depth++) {
    const code = typeof current.code === 'string' ? current.code : '';
    for (const [category, codes] of Object.entries(NETWORK_CODES)) if (codes.includes(code)) return category;
  }
  return null;
}

module.exports = { NETWORK_CODES, networkCategory };
