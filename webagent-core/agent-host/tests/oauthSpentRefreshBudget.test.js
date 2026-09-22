// spentRefresh is the refresh-token replay tombstone set. Entries only expire after
// REFRESH_TTL_MS (7 days), so before this budget existed a paired client that kept rotating its
// refresh token added one effectively permanent entry per call with nothing to evict it. At the
// /oauth/token rate limit of 60/min sustained across the TTL that is ~604800 entries (~109MB
// measured). Every other store in oauth.js is bounded, so this was the outlier.
//
// The eviction tradeoff is deliberate and asserted below: replaying a token whose tombstone was
// evicted is refused as a plain invalid_grant instead of also revoking the client's other tokens.
// The replay is still rejected -- only the extra punitive revocation is lost.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-oauth-spent-'));
const { config } = require('../src/config');
config.workspaceRoot = tmp;

const oauth = require('../src/mcp/oauth');

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// Register a client, clear the pairing gate, and exchange an auth code for the first token pair.
function pairedClient() {
  const reg = oauth.registerClient({
    redirect_uris: ['https://example.com/cb'],
    token_endpoint_auth_method: 'none'
  });
  oauth.ensurePairing();
  const snap = oauth.snapshotPairing();
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const redirect = oauth.completeAuthorize({
    client_id: reg.client_id,
    redirect_uri: 'https://example.com/cb',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    response_type: 'code',
    pairing_code: snap.code
  });
  const tokens = oauth.handleToken({
    grant_type: 'authorization_code',
    client_id: reg.client_id,
    code: new URL(redirect).searchParams.get('code'),
    redirect_uri: 'https://example.com/cb',
    code_verifier: verifier
  });
  return { clientId: reg.client_id, tokens };
}

const refresh = (clientId, token) =>
  oauth.handleToken({ grant_type: 'refresh_token', client_id: clientId, refresh_token: token });

function refuses(fn) {
  try { fn(); return null; } catch (err) { return err.message; }
}

function main() {
  try {
    // --- Recent replay must still be detected and must still revoke the client's tokens. ---
    {
      const { clientId, tokens } = pairedClient();
      const spent = tokens.refresh_token;
      const rotated = refresh(clientId, spent);

      const replay = refuses(() => refresh(clientId, spent));
      assert.ok(replay, 'replaying a spent refresh token must be refused');
      assert.match(replay, /replay detected/, 'a recent tombstone must still trigger replay detection');

      // Replay detection revokes every token for that client, including the freshly rotated one.
      assert.ok(
        refuses(() => refresh(clientId, rotated.refresh_token)),
        'replay detection must revoke the rotated token too'
      );
    }

    // --- Sustained rotation must not grow memory without bound. ---
    // Assert the store size directly. Heap growth is the symptom but it is not a reliable
    // assertion without --expose-gc, and run-tests.js does not pass that flag.
    const ROTATIONS = oauth.MAX_SPENT_REFRESH * 3;
    const { clientId, tokens } = pairedClient();
    const firstEverToken = tokens.refresh_token;
    let current = tokens;
    for (let i = 0; i < ROTATIONS; i += 1) {
      current = refresh(clientId, current.refresh_token);
    }

    // Unbounded growth was ~188 bytes per rotation with nothing evicting entries before the 7 day
    // TTL, i.e. ~604800 entries / ~109MB at the sustained /oauth/token rate limit.
    assert.ok(
      oauth.spentRefreshSize() <= oauth.MAX_SPENT_REFRESH,
      `spentRefresh must stay within its budget; ${ROTATIONS} rotations left ${oauth.spentRefreshSize()} entries (cap ${oauth.MAX_SPENT_REFRESH})`
    );

    // --- An evicted tombstone still refuses the token; only the extra revocation is lost. ---
    const evicted = refuses(() => refresh(clientId, firstEverToken));
    assert.ok(evicted, 'a refresh token evicted from the tombstone set must still be refused');
    assert.doesNotMatch(
      evicted,
      /replay detected/,
      'an evicted tombstone degrades to invalid_grant rather than claiming detection it can no longer prove'
    );

    // The current token must remain usable: eviction must not disturb live sessions.
    const stillWorks = refresh(clientId, current.refresh_token);
    assert.ok(stillWorks.access_token, 'eviction must not invalidate the live refresh token');

    console.log('oauth spentRefresh budget tests passed');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main();
