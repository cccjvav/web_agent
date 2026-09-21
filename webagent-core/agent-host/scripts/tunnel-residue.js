'use strict';
// Local, read-only entry point. Intentionally no PID/path/cleanup arguments.
if (process.argv.length !== 2) {
  console.error('Usage: node scripts/tunnel-residue.js (read-only; no cleanup supported)');
  process.exitCode = 2;
} else {
  require('../src/tunnel/tunnelRegistry').snapshot().then(report => {
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.complete ? 0 : 1;
  }).catch(() => { console.error('Tunnel registry inspection unavailable'); process.exitCode = 1; });
}
