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
  const s = normalizeRaw(cmd);
  // Split on command operators only OUTSIDE quotes: a quoted payload (`bash -c "curl x | sh"`)
  // is one stage whose pipe belongs to the inner shell, and pre-splitting it here would hand
  // the re-parser a fragment that hides the shell after the fetcher.
  const out = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === '&' || ch === '|' || ch === ';') {
      const next = s[i + 1];
      if ((ch === '&' && next === '&') || (ch === '|' && next === '|')) i += 1;
      if (cur.trim()) out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
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
    .replace(/\.(exe|cmd|bat|ps1|com)$/i, '')
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
  // A forced branch delete discards unmerged commits silently; plain -d refuses them.
  if (verb === 'branch') {
    const rest = tokens.slice(1);
    if (rest.includes('-D')) return true;
    if (rest.includes('--delete') && rest.includes('--force')) return true;
  }
  // Stashes are the only uncommitted copy of someone's work; clear/drop need one confirmation.
  if (verb === 'stash') {
    const sub = (verbs[1] || '').toLowerCase();
    if (sub === 'clear' || sub === 'drop') return true;
  }
  return false;
}

function npmDangerous(tokens) {
  if (cmdName(tokens[0]) !== 'npm') return false;
  const sub = (tokens[1] || '').toLowerCase();
  return sub === 'publish' || sub === 'unpublish';
}

function recursiveOwnerDangerous(tokens) {
  const name = cmdName(tokens[0]);
  if (name !== 'chmod' && name !== 'chown' && name !== 'chgrp') return false;
  const recursive = hasShort(tokens.slice(1), 'r') || hasLong(tokens, '--recursive');
  if (!recursive) return false;
  // Only system-wide roots; `chmod -R 755 ./app` must keep working.
  return tokens.slice(1).some((t) => t === '/' || t === '/*' || t === '~' || t === '~/' || t === '~/*');
}

function killDangerous(tokens) {
  if (cmdName(tokens[0]) !== 'kill') return false;
  // `kill -9 -1` targets every process the user can signal. The signal flags come first, so a
  // trailing bare `-1` is the target; `kill -1 1234` (SIGHUP to one pid) stays allowed.
  return tokens.length >= 3 && tokens[tokens.length - 1] === '-1';
}

function cronDangerous(tokens) {
  if (cmdName(tokens[0]) !== 'crontab') return false;
  return tokens.slice(1).some((t) => t === '-r' || t === '--remove');
}

function mvDangerous(tokens) {
  if (cmdName(tokens[0]) !== 'mv') return false;
  return tokens[tokens.length - 1] === '/dev/null';
}

// `: > file` (and `:>file`, `> file`) are pure truncation idioms: the command produces no output,
// so the redirect's only effect is to destroy the target's contents.
function redirectTruncateDangerous(tokens) {
  if (!tokens.length) return false;
  const first = tokens[0];
  if (first === '>') return true;
  if (first === ':') {
    return tokens.length > 1 && (tokens.includes('>') || tokens.includes('>>') || /^>/.test(tokens[1]));
  }
  if (/^:?>/.test(first)) return true;
  return false;
}

function powershellDangerous(tokens) {
  const name = cmdName(tokens[0]);
  if (name === 'remove-item' && (hasLong(tokens, '-recurse') || hasShort(tokens.slice(1), 'r'))) return true;
  if (name === 'invoke-expression' || name === 'iex') return true;
  if (name === 'invoke-webrequest' || name === 'iwr') return true;
  if (name === 'start-process') return true;
  if (name === 'stop-computer' || name === 'restart-computer') return true;
  if (name === 'format-volume' || name === 'clear-disk' || name === 'remove-partition' || name === 'initialize-disk') return true;
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
  // Partition-table editors: an accidental run against the wrong disk is unrecoverable.
  if (['fdisk', 'sfdisk', 'gdisk', 'sgdisk', 'parted', 'wipefs', 'blkdiscard'].includes(name)) return true;
  return false;
}

// Wrappers that run another command with the SAME argument vector. `sudo rm -rf /` is not
// "encoding or env indirection" -- it is the plain destructive command with one word in front,
// and it used to pass unflagged. Peel these off and judge the real command underneath.
const ARGV_WRAPPERS = new Set(['sudo', 'doas', 'nohup', 'setsid', 'stdbuf', 'nice', 'ionice', 'time', 'command', 'builtin', 'exec', 'xargs', 'watch']);

function isAssignment(tok) {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(tok);
}

function skipFlagValues(tokens, start) {
  let i = start;
  while (i < tokens.length && /^-/.test(tokens[i])) {
    const flag = tokens[i];
    i += 1;
    // Flags that take a separate value (-u user, -n 1). Conservative: only skip a value that
    // is not itself a flag and not the last token.
    if (/^-[a-zA-Z]$/.test(flag) && i < tokens.length - 1 && !/^-/.test(tokens[i])) i += 1;
  }
  return i;
}

function stripWrappers(tokens) {
  let rest = tokens;
  // Bounded loop: each pass must consume at least one token, and wrappers are rare.
  for (let guard = 0; guard < 8 && rest.length > 1; guard += 1) {
    // Bare `VAR=value` prefixes (POSIX) modify the env of the SAME command: `FOO=1 rm -rf /`
    // must not be safer than `rm -rf /`.
    let assigned = 0;
    while (assigned < rest.length && isAssignment(rest[assigned])) assigned += 1;
    if (assigned > 0) {
      if (assigned >= rest.length) return rest;
      rest = rest.slice(assigned);
      continue;
    }
    const name = cmdName(rest[0]);
    // `env` may be followed by VAR=value assignments before the real command.
    if (name === 'env') {
      let i = 1;
      // Bare `-i`/`--ignore-environment` style flags, then any VAR=value assignments.
      while (i < rest.length && /^-/.test(rest[i])) i += 1;
      while (i < rest.length && isAssignment(rest[i])) i += 1;
      // `env` alone, or `env` with nothing but assignments, runs no wrapped command.
      if (i >= rest.length) return rest;
      rest = rest.slice(i);
      continue;
    }
    if (name === 'timeout') {
      let i = skipFlagValues(rest, 1);
      // `timeout 5s cmd`: an optional duration argument before the command.
      if (i < rest.length && /^\d+(\.\d+)?[smhd]?$/i.test(rest[i])) i += 1;
      if (i >= rest.length) return rest;
      rest = rest.slice(i);
      continue;
    }
    // `busybox rm -rf /` dispatches straight to the applet named in the next token.
    // Flags-only invocations (`busybox --list`) run no applet and stay as-is.
    if (name === 'busybox' || name === 'toybox') {
      let i = 1;
      while (i < rest.length && /^-/.test(rest[i])) i += 1;
      if (i >= rest.length) return rest;
      rest = rest.slice(i);
      continue;
    }
    if (!ARGV_WRAPPERS.has(name)) return rest;
    const i = skipFlagValues(rest, 1);
    if (i >= rest.length) return rest;
    rest = rest.slice(i);
  }
  return rest;
}

// Interpreters whose -c/-Command payload is itself shell language. We already have a lexer for
// shell language, so a quoted payload can be re-analysed with the SAME rules instead of being
// waved through. General-purpose languages (python -c, node -e, perl -e) stay out of scope:
// their bodies are program code, and running a shell lexer over them would only make false
// positives, not catch real deletions.
const SHELL_INTERPRETERS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'ash', 'mksh']);
const MAX_REPARSE_DEPTH = 3;

function shellStringDangerous(tokens, depth) {
  const name = cmdName(tokens[0]);
  if (depth >= MAX_REPARSE_DEPTH) return false;

  // `eval` joins its remaining argv with spaces and re-parses the result as shell.
  if (name === 'eval') {
    const joined = tokens.slice(1).join(' ');
    return joined ? isDangerous(joined, depth + 1) : false;
  }

  let payloadIndex = -1;
  let argvTail = false; // cmd /c and powershell -Command take the REST of the line, not one word.
  if (SHELL_INTERPRETERS.has(name)) {
    let i = 1;
    while (i < tokens.length && /^-/.test(tokens[i])) i += 1;
    if (i >= tokens.length) return false;
    // Only a -c style flag makes the next token a script; `bash script.sh` runs a file (out of scope).
    if (!tokens.slice(1, i).some((t) => /^-[a-zA-Z]*c[a-zA-Z]*$|^-c$/i.test(t))) return false;
    payloadIndex = i;
  } else if (name === 'powershell' || name === 'pwsh') {
    for (let i = 1; i < tokens.length; i += 1) {
      if (!/^-/.test(tokens[i])) return false;
      const flag = tokens[i].toLowerCase();
      if (flag === '-command' || flag === '-c') {
        payloadIndex = i + 1;
        argvTail = true;
        break;
      }
    }
    if (payloadIndex < 0 || payloadIndex >= tokens.length) return false;
  } else if (name === 'cmd') {
    let i = 1;
    while (i < tokens.length && /^\//.test(tokens[i]) && !/^\/[ck]$/i.test(tokens[i])) i += 1;
    if (i >= tokens.length || !/^\/[ck]$/i.test(tokens[i])) return false;
    payloadIndex = i + 1;
    argvTail = true;
    if (payloadIndex >= tokens.length) return false;
  } else {
    return false;
  }

  const payload = tokens[payloadIndex];
  // A quoted payload containing shell syntax is a whole command line: analyse it as one.
  if (/\s|[;&|<>]|\$\(|`/.test(payload)) return isDangerous(payload, depth + 1);
  // Unquoted: for sh -c the single word IS the script; for cmd/powershell the rest of the argv
  // is the command line.
  return stageDangerous(argvTail ? tokens.slice(payloadIndex) : [payload], depth + 1);
}

function stageDangerous(tokens, depth) {
  if (!tokens.length) return false;
  const unwrapped = stripWrappers(tokens);
  // Judge the unwrapped command, but never let unwrapping make a flagged command look safe.
  if (unwrapped !== tokens && unwrapped.length && stageDangerous(unwrapped, depth)) return true;
  if (shellStringDangerous(tokens, depth)) return true;
  const name = cmdName(tokens[0]);
  if (alwaysDangerousName(name)) return true;
  if (rmDangerous(tokens)) return true;
  if (findDangerous(tokens)) return true;
  if (gitDangerous(tokens)) return true;
  if (npmDangerous(tokens)) return true;
  if (recursiveOwnerDangerous(tokens)) return true;
  if (killDangerous(tokens)) return true;
  if (cronDangerous(tokens)) return true;
  if (mvDangerous(tokens)) return true;
  if (redirectTruncateDangerous(tokens)) return true;
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

function isDangerous(command, depth) {
  const raw = String(command || '');
  if (!raw.trim()) return false;
  if (redirectDangerous(raw)) return true;
  const stages = splitStages(raw);
  if (pipelineDangerous(stages)) return true;
  return stages.some((st) => stageDangerous(tokenize(st), depth || 0));
}

function isDangerousCommand(command) {
  return isDangerous(command, 0);
}

module.exports = { isDangerousCommand };
