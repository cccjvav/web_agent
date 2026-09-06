const { ProtocolError } = require('../mcp/errors');

/**
 * Best-effort destructive-command detector used by callTool for both
 * local Chat and remote MCP. Not an OS sandbox: encoding, env indirection,
 * and nested scripts can still slip through.
 *
 * Policy lives here only — remote always E_FORBIDDEN, local needs confirm_dangerous.
 */

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

function stageDangerous(tokens) {
  if (!tokens.length) return false;
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

function assertCommandAllowed(command, { remote = false, confirmDangerous = false } = {}) {
  if (!isDangerousCommand(command)) return;
  if (remote) {
    throw new ProtocolError(
      'E_FORBIDDEN',
      'Destructive commands are blocked on remote MCP. Run them from local Chat if you really mean it.',
      { retryHint: 'Use the local workbench Chat in Code mode, or pick a non-destructive command.' }
    );
  }
  if (!confirmDangerous) {
    throw new ProtocolError(
      'E_BAD_ARGS',
      'Destructive command blocked. Pass confirm_dangerous=true if you really mean it.',
      { retryHint: 'Retry the same command with confirm_dangerous=true only if the user asked for this destructive action.' }
    );
  }
}

module.exports = {
  isDangerousCommand,
  assertCommandAllowed
};
