'use strict';
// Shared lexical detector, not an operating-system sandbox.
function stripEmptyQuotes(s) {
  let out = String(s || '');
  let prev;
  do {
    prev = out;
    out = out.replace(/""/g, '').replace(/''/g, '');
  } while (out !== prev);
  return out;
}

function normalizeRaw(cmd) {
  return stripEmptyQuotes(cmd)
    .replace(/[\u0000-\u001f\u00a0]/g, ' ')
    .replace(/\\\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitStages(cmd) {
  return normalizeRaw(cmd)
    .split(/\s*(?:&&|\|\||[|;&])\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function tokenize(stage) {
  const s = stripEmptyQuotes(stage).trim();
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(s))) {
    out.push(m[1] != null ? m[1] : m[2] != null ? m[2] : m[3]);
  }
  return out;
}

function cmdName(tok) {
  return String(tok || '')
    .replace(/^.*[/\\]/, '')
    .replace(/\.(exe|cmd|bat|ps1)$/i, '')
    .toLowerCase();
}

function shortLetters(tok) {
  if (!/^-[^-]/.test(tok)) return [];
  return tok.slice(1).split('');
}

function hasShort(tokens, letter) {
  const want = String(letter).toLowerCase();
  return tokens.some((t) => shortLetters(t).some((ch) => ch.toLowerCase() === want));
}

function hasLong(tokens, name) {
  const want = String(name).toLowerCase();
  return tokens.some((t) => t.toLowerCase() === want);
}

function hasWinSwitch(tokens, letter) {
  const want = String(letter).toLowerCase();
  return tokens.some((t) => {
    if (!/^\/[a-z0-9-]+$/i.test(t)) return false;
    return t.slice(1).toLowerCase().startsWith(want);
  });
}

function rmDangerous(tokens) {
  if (cmdName(tokens[0]) !== 'rm') return false;
  const rest = tokens.slice(1);
  return hasShort(rest, 'r') || hasLong(rest, '--recursive');
}

function findDangerous(tokens) {
  if (cmdName(tokens[0]) !== 'find') return false;
  return tokens.some((t) => t === '-delete' || t === '-exec');
}

function gitDangerous(tokens) {
  if (cmdName(tokens[0]) !== 'git') return false;
  const verbs = tokens.slice(1).filter((t) => t && !t.startsWith('-'));
  const verb = (verbs[0] || '').toLowerCase();
  if (verb === 'push') return true;
  if (verb === 'reset' && hasLong(tokens, '--hard')) return true;
  if (verb === 'checkout' && tokens.includes('--')) return true;
  if (verb === 'clean' && (hasShort(tokens.slice(1), 'f') || hasLong(tokens, '--force'))) return true;
  return false;
}

function powershellDangerous(tokens) {
  const name = cmdName(tokens[0]);
  if (name === 'remove-item' && (hasLong(tokens, '-recurse') || hasShort(tokens.slice(1), 'r'))) return true;
  if (name === 'invoke-expression' || name === 'iex') return true;
  if (name === 'invoke-webrequest' || name === 'iwr') return true;
  if (name === 'start-process') return true;
  if (name === 'powershell' || name === 'pwsh') {
    return tokens.some((t) => /^-enc(odedcommand)?$/i.test(t));
  }
  return false;
}

function windowsDangerous(tokens) {
  const name = cmdName(tokens[0]);
  if ((name === 'del' || name === 'erase') && hasWinSwitch(tokens, 's')) return true;
  if ((name === 'rd' || name === 'rmdir') && hasWinSwitch(tokens, 's')) return true;
  if (name === 'format') return true;
  if (name === 'shutdown' || name === 'reboot' || name === 'halt' || name === 'poweroff') return true;
  if (name === 'certutil' && tokens.some((t) => /^-urlcache$/i.test(t))) return true;
  if (name === 'bitsadmin') return true;
  if (name === 'reg' && (tokens[1] || '').toLowerCase() === 'add') return true;
  if (name === 'net' && (tokens[1] || '').toLowerCase() === 'user') return true;
  if (name === 'schtasks') return true;
  return false;
}

function alwaysDangerousName(name) {
  if (!name) return false;
  if (name === 'dd' || name === 'shred' || name === 'truncate' || name === 'mkfs') return true;
  if (name.startsWith('mkfs.')) return true;
  return false;
}

// Wrappers that run another command with the SAME argument vector. `sudo rm -rf /` is not
// "encoding or env indirection" -- it is the plain destructive command with one word in front,
// and it used to pass unflagged. Peel these off and judge the real command underneath.
// Deliberately narrow: only wrappers whose remaining tokens are still an ordinary argv. Things
// like `bash -c "..."` and `eval` take a *string* to re-parse, which is the documented
// out-of-scope case and is not handled here.
const ARGV_WRAPPERS = new Set(['sudo', 'doas', 'nohup', 'setsid', 'stdbuf', 'nice', 'ionice', 'time', 'command', 'builtin', 'exec', 'xargs']);

function stripWrappers(tokens) {
  let rest = tokens;
  // Bounded loop: each pass must consume at least one token, and wrappers are rare.
  for (let guard = 0; guard < 8 && rest.length > 1; guard += 1) {
    const name = cmdName(rest[0]);
    // `env` may be followed by VAR=value assignments before the real command.
    if (name === 'env') {
      let i = 1;
      // Bare `-i`/`--ignore-environment` style flags, then any VAR=value assignments.
      while (i < rest.length && /^-/.test(rest[i])) i += 1;
      while (i < rest.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(rest[i])) i += 1;
      // `env` alone, or `env` with nothing but assignments, runs no wrapped command.
      if (i >= rest.length) return rest;
      rest = rest.slice(i);
      continue;
    }
    if (!ARGV_WRAPPERS.has(name)) return rest;
    let i = 1;
    // Skip the wrapper's own flags (e.g. `sudo -u root`, `xargs -0 -n1`), but stop at the first
    // bare word, which is the wrapped command.
    while (i < rest.length && /^-/.test(rest[i])) {
      const flag = rest[i];
      i += 1;
      // Flags that take a separate value (-u user, -n 1). Conservative: only skip a value that
      // is not itself a flag and not the last token.
      if (/^-[a-zA-Z]$/.test(flag) && i < rest.length - 1 && !/^-/.test(rest[i])) i += 1;
    }
    if (i >= rest.length) return rest;
    rest = rest.slice(i);
  }
  return rest;
}

function stageDangerous(tokens) {
  if (!tokens.length) return false;
  const unwrapped = stripWrappers(tokens);
  // Judge the unwrapped command, but never let unwrapping make a flagged command look safe.
  if (unwrapped !== tokens && unwrapped.length && stageDangerous(unwrapped)) return true;
  const name = cmdName(tokens[0]);
  if (alwaysDangerousName(name)) return true;
  if (rmDangerous(tokens)) return true;
  if (findDangerous(tokens)) return true;
  if (gitDangerous(tokens)) return true;
  if (powershellDangerous(tokens)) return true;
  if (windowsDangerous(tokens)) return true;
  const joined = tokens.map((t) => t.toLowerCase()).join(' ');
  if (/\bdrop\s+database\b/.test(joined)) return true;
  return false;
}

function pipelineDangerous(stages) {
  const names = stages.map((st) => cmdName(tokenize(st)[0] || ''));
  const fetchers = new Set(['curl', 'wget', 'iwr', 'invoke-webrequest']);
  const shells = new Set(['sh', 'bash', 'zsh', 'cmd', 'powershell', 'pwsh']);
  let sawFetch = false;
  for (const n of names) {
    if (fetchers.has(n)) sawFetch = true;
    if (sawFetch && shells.has(n)) return true;
  }
  return false;
}

function redirectDangerous(raw) {
  const n = normalizeRaw(raw);
  if (/>\s*\/dev\/sd/i.test(n)) return true;
  if (/>\s*\\\\\.\\physicaldrive/i.test(n)) return true;
  return false;
}

function isDangerousCommand(command) {
  const raw = String(command || '');
  if (!raw.trim()) return false;
  if (redirectDangerous(raw)) return true;
  const stages = splitStages(raw);
  if (pipelineDangerous(stages)) return true;
  return stages.some((st) => stageDangerous(tokenize(st)));
}

module.exports = { isDangerousCommand };
