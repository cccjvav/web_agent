'use strict';
// Shared lexical detector, not an operating-system sandbox.
//
// Scope (explained in tools/工具入口与命令策略详解.md; pinned by dangerousCommands.test.js):
//  * Covered: the destructive command itself; argv wrappers in front of it (`sudo -n`, `env VAR=x`,
//    bare `VAR=x`, `timeout 5`, `busybox`…); and LITERAL script text handed to a shell interpreter
//    (`bash -c "…"`, `cmd /c …`, `powershell -Command …`), which is re-scanned with these same
//    rules at bounded depth.
//  * Not covered: anything that needs evaluation to know the real command — `eval`, command
//    substitution `$(…)`, variables, aliases, backslash-escaped names (`r\m`), interpreter bodies
//    (`python -c`, `node -e`). PowerShell -EncodedCommand is flagged as opaque. The real backstop
//    is process-group termination plus workspace path limits, not this table.
//  * Everyday work must not be flagged: a guard that blocks `npm test` or `git branch -M main`
//    gets switched off, which is worse than a miss. `git push` stays flagged because it publishes
//    (long-standing policy, not a new rule).

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
    .replace(/\s+/g, ' ')
    .trim();
}

// Split on the separators ; | & && || EVERYWHERE, quotes included (unchanged since the first
// version). Deliberately naive: bash, PowerShell and cmd disagree on escapes (\" vs ` vs ^), so a
// quote-aware splitter can be talked into swallowing a real separator on one of the three. The
// naive split never under-splits; its only cost is flagging a quoted `; rm -rf x` inside an echo or
// commit message, which is a harmless confirmation prompt.
// F72: a line break is a separator too (bash, PowerShell and batch files all run the next line as
// a new command). normalizeRaw used to turn it into a space, so `echo hi` + newline + `rm -rf x`
// was one harmless `echo` stage — measured end to end, remote MCP ran it. Brackets ( ) { } split
// the same naive way, so a subshell `(rm -rf x)` or a script block `{ Remove-Item -Recurse x }`
// is judged by its own first word; the reserved words in front (if/then/do…) are dropped in
// stripWrappers.
function splitStages(cmd) {
  return String(cmd || '')
    .split(/\r\n|[\r\n]/)
    .flatMap((line) => normalizeRaw(line).split(/\s*(?:&&|\|\||[|;&(){}])\s*/))
    .map((s) => s.trim())
    .filter(Boolean);
}

// Line continuations join physical lines back into one command: bash `\`, PowerShell backtick,
// cmd `^`. Whether that happens depends on the shell (a trailing `\` is literal in PowerShell), so
// every reading is judged and ANY dangerous reading counts: the lines as written, the lines joined
// with nothing (bash turns `r\` + newline + `m` into `rm`), and joined with a space.
function readings(raw) {
  if (!/[\\`^]\r?\n/.test(raw)) return [raw];
  return [raw, raw.replace(/[\\`^]\r?\n/g, ''), raw.replace(/[\\`^]\r?\n/g, ' ')];
}

// Shell-style words: quoted segments concatenate with their neighbours, so `r"m"` and `'rm'` are
// both the word rm. Backslashes stay literal (Windows paths); see the scope note above.
function tokenize(stage) {
  const s = String(stage || '');
  const out = [];
  let cur = null;
  let quote = null;
  for (const ch of s) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; if (cur === null) cur = ''; continue; }
    if (/\s/.test(ch)) {
      if (cur !== null) { out.push(cur); cur = null; }
      continue;
    }
    cur = (cur || '') + ch;
  }
  if (cur !== null) out.push(cur);
  // `""` / `''` words are dropped, as the original stripEmptyQuotes did: `"" rm -rf /` must still
  // be judged as rm (conservative; the empty word would only make the shell fail).
  return out.filter((word) => word !== '');
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

// Case-sensitive single-letter flag, for tools where -D and -d (or -R and -r) differ.
function hasShortExact(tokens, letter) {
  return tokens.some((t) => shortLetters(t).includes(letter));
}

function hasLong(tokens, name) {
  const want = String(name).toLowerCase();
  return tokens.some((t) => t.toLowerCase() === want);
}

// PowerShell accepts any unambiguous parameter prefix: -r, -Rec and -Recurse are all -Recurse.
function hasPsParam(tokens, name) {
  const want = String(name).toLowerCase();
  return tokens.some((t) => {
    const m = /^-([a-z]+)(?::.*)?$/i.exec(t);
    return Boolean(m) && want.startsWith(m[1].toLowerCase());
  });
}

function hasWinSwitch(tokens, letter) {
  const want = String(letter).toLowerCase();
  return tokens.some((t) => {
    if (!/^\/[a-z0-9-]+$/i.test(t)) return false;
    return t.slice(1).toLowerCase().startsWith(want);
  });
}

// Targets whose recursive permission/ownership change breaks a machine or a home directory.
function isSystemRoot(tok) {
  return /^(?:\/|\/\*|~|~\/|~\/\*|\$HOME\/?|[a-z]:[\\/]?|\/(?:etc|usr|var|bin|sbin|lib|lib64|boot|home|opt|root|sys|proc|dev)\/?)$/i
    .test(String(tok || ''));
}

function rmDangerous(tokens) {
  if (cmdName(tokens[0]) !== 'rm') return false;
  const rest = tokens.slice(1);
  return hasShort(rest, 'r') || hasLong(rest, '--recursive');
}

function findDangerous(tokens) {
  if (cmdName(tokens[0]) !== 'find') return false;
  return tokens.some((t) => ['-delete', '-exec', '-execdir', '-ok', '-okdir'].includes(t));
}

// git global options that consume the next token: `git -C repo push` is judged by `push`.
const GIT_OPTS_WITH_VALUE = new Set(['-c', '-C', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--super-prefix', '--config-env']);

function gitVerbAndArgs(tokens) {
  let i = 1;
  while (i < tokens.length && tokens[i].startsWith('-')) {
    i += GIT_OPTS_WITH_VALUE.has(tokens[i]) ? 2 : 1;
  }
  return { verb: (tokens[i] || '').toLowerCase(), args: tokens.slice(i + 1) };
}

function gitDangerous(tokens) {
  if (cmdName(tokens[0]) !== 'git') return false;
  const { verb, args } = gitVerbAndArgs(tokens);
  const sub = (args.find((t) => !t.startsWith('-')) || '').toLowerCase();
  switch (verb) {
    // Publishing is flagged; a dry run publishes nothing.
    case 'push': return !(hasLong(args, '--dry-run') || hasShortExact(args, 'n'));
    case 'reset': return hasLong(args, '--hard');
    case 'checkout': return args.includes('--') || hasShortExact(args, 'f') || hasLong(args, '--force');
    case 'clean': return hasShort(args, 'f') || hasLong(args, '--force');
    // Deleting an UNMERGED branch; plain -d refuses to. (-M/-C renames are everyday: not flagged.)
    case 'branch':
      return hasShortExact(args, 'D')
        || ((hasShortExact(args, 'd') || hasLong(args, '--delete')) && (hasShortExact(args, 'f') || hasLong(args, '--force')));
    case 'stash': return sub === 'clear' || sub === 'drop';
    // Same effect as `git checkout -- <path>` (already flagged): discards uncommitted edits.
    // Only unstaging (--staged / -S without the worktree) is harmless.
    case 'restore': {
      const staged = hasLong(args, '--staged') || hasShortExact(args, 'S');
      const worktree = hasLong(args, '--worktree') || hasShortExact(args, 'W');
      return !staged || worktree;
    }
    case 'filter-branch':
    case 'filter-repo': return true;
    case 'reflog': return sub === 'expire' || sub === 'delete';
    case 'update-ref': return hasShortExact(args, 'd');
    case 'worktree': return sub === 'remove' && (hasShortExact(args, 'f') || hasLong(args, '--force'));
    default: return false;
  }
}

function packageManagerDangerous(tokens) {
  const name = cmdName(tokens[0]);
  if (!['npm', 'pnpm', 'yarn', 'bun'].includes(name)) return false;
  const rest = tokens.slice(1);
  if (hasLong(rest, '--dry-run')) return false;
  const verb = (rest.find((t) => !t.startsWith('-')) || '').toLowerCase();
  return verb === 'publish' || verb === 'unpublish';
}

// kill: signal every process the user can reach (`kill -9 -1`, `kill -- -1`). The first option is
// the signal (`kill -1 1234` is SIGHUP to 1234 and is fine); -1 as a PID operand is the danger.
function killAllDangerous(tokens) {
  if (cmdName(tokens[0]) !== 'kill') return false;
  const rest = tokens.slice(1);
  let i = 0;
  if (rest[i] === '-s' || rest[i] === '-n') i += 2;
  else if (/^-(?:\d+|[A-Za-z]+)$/.test(rest[i] || '')) i += 1;
  return rest.slice(i).some((t) => t === '-1');
}

function unixSystemDangerous(tokens) {
  const name = cmdName(tokens[0]);
  const rest = tokens.slice(1);
  if (['chmod', 'chown', 'chgrp'].includes(name)
    && (hasShortExact(rest, 'R') || hasLong(rest, '--recursive'))
    && rest.some(isSystemRoot)) return true;
  if (name === 'crontab' && hasShortExact(rest, 'r')) return true;
  if (killAllDangerous(tokens)) return true;
  if (name === 'mv' && rest.includes('/dev/null')) return true;
  if (name === 'wipefs' && (hasShortExact(rest, 'a') || hasLong(rest, '--all'))) return true;
  if (name === 'systemctl' && /^(?:poweroff|reboot|halt|kexec)$/i.test(rest[0] || '')) return true;
  // `: > file` / `true > file` truncate a file exactly like `truncate -s 0 file` (always flagged).
  // `>>` (append nothing) and `>&2` are harmless. A bare `> file` is NOT matched: splitting on `&`
  // turns the everyday `npm test &> log.txt` into a `> log.txt` stage.
  // A redirect with no target left in this stage (`true >&2` splits on '&' into `true >` + `2`)
  // is a descriptor duplication, not a file truncation.
  if (/^(?::|true) ?>(?![>&])\s*\S/.test(tokens.join(' '))) return true;
  return false;
}

// powershell.exe / pwsh parameters that take a separate value. -File switches to script-file mode.
const PS_VALUE_PARAMS = /^-(?:ex|ep|executionpolicy|w|wi|win|window|windowstyle|of|outputformat|if|inputformat|config|configurationname|wd|workingdirectory|v|version|psconsolefile|settingsfile|custompipename)$/i;

// Split a powershell/pwsh argv into its own parameters and the command text. Tokens after
// -Command (or after the first bare argument) belong to the script, so a script's own `-e`
// (`node -e …`) is never mistaken for -EncodedCommand.
// Returns `own` as [index-in-rest, token] pairs so callers can look at the following token.
function powershellArgs(rest) {
  const own = [];
  for (let i = 0; i < rest.length; i++) {
    const t = rest[i];
    if (/^-(?:c|com|comm|comma|comman|command|cwa|commandwithargs)$/i.test(t)) {
      return { own, script: i + 1 < rest.length ? rest.slice(i + 1).join(' ') : null };
    }
    if (/^-(?:f|fi|fil|file)$/i.test(t)) return { own, script: null };
    if (!t.startsWith('-')) return { own, script: rest.slice(i).join(' ') };
    own.push([i, t]);
    if (PS_VALUE_PARAMS.test(t)) i += 1;
  }
  return { own, script: null };
}

// -EncodedCommand under any accepted spelling: its alias -ec, or any prefix from -e upwards.
function isEncodedCommandParam(tok) {
  const t = String(tok || '').toLowerCase();
  return t === '-ec' || (t.length >= 2 && '-encodedcommand'.startsWith(t));
}

function powershellDangerous(tokens) {
  const name = cmdName(tokens[0]);
  const rest = tokens.slice(1);
  // Remove-Item and its PowerShell aliases. (`rm -r` is also covered by rmDangerous.)
  if (['remove-item', 'ri', 'rd', 'rmdir', 'del', 'erase'].includes(name) && hasPsParam(rest, 'recurse')) return true;
  if (name === 'invoke-expression' || name === 'iex') return true;
  if (name === 'invoke-webrequest' || name === 'iwr') return true;
  if (name === 'start-process') return true;
  if (['stop-computer', 'restart-computer', 'format-volume', 'clear-disk', 'remove-partition', 'initialize-disk', 'clear-recyclebin'].includes(name)) return true;
  if (name === 'powershell' || name === 'pwsh') {
    // -EncodedCommand (any prefix: -e, -en, -enc…, or -ec) hides the script from a lexical check:
    // treat it as opaque, hence dangerous.
    // A trailing -e with no value is a usage error that runs nothing.
    const { own } = powershellArgs(rest);
    return own.some(([at, t]) => isEncodedCommandParam(t) && at + 1 < rest.length);
  }
  return false;
}

function windowsDangerous(tokens) {
  const name = cmdName(tokens[0]);
  const verb = (tokens[1] || '').toLowerCase();
  if ((name === 'del' || name === 'erase') && hasWinSwitch(tokens, 's')) return true;
  if ((name === 'rd' || name === 'rmdir') && hasWinSwitch(tokens, 's')) return true;
  if (name === 'format' || name === 'diskpart') return true;
  if (name === 'shutdown' || name === 'reboot' || name === 'halt' || name === 'poweroff') return true;
  if (name === 'certutil' && tokens.some((t) => /^-urlcache$/i.test(t))) return true;
  if (name === 'bitsadmin') return true;
  if (name === 'reg' && (verb === 'add' || verb === 'delete')) return true;
  if (name === 'net' && verb === 'user') return true;
  if (name === 'schtasks') return true;
  if (name === 'vssadmin' && (verb === 'delete' || verb === 'resize')) return true;
  return false;
}

function alwaysDangerousName(name) {
  if (!name) return false;
  if (name === 'dd' || name === 'shred' || name === 'truncate' || name === 'mkfs' || name === 'mkswap') return true;
  if (name.startsWith('mkfs.')) return true;
  return false;
}

// Argv wrappers: after their own options, the remaining tokens are an ordinary command line.
// `value` lists the options that take a SEPARATE value token (`sudo -u root`); every other option
// is a bare flag. The old rule "any one-letter flag eats the next word" read `sudo -n rm -rf /` as
// "-n with value rm" and let it through. `positional` counts operands before the command
// (`timeout 5 …`, `chroot /mnt …`).
const ARGV_WRAPPERS = {
  sudo: { value: ['-u', '-g', '-p', '-C', '-D', '-r', '-t', '-U', '-T', '--user', '--group', '--prompt', '--close-from', '--chdir', '--role', '--type', '--other-user', '--command-timeout'] },
  doas: { value: ['-u', '-C'] },
  nohup: {},
  setsid: {},
  stdbuf: { value: ['-i', '-o', '-e'] },
  nice: { value: ['-n', '--adjustment'] },
  ionice: { value: ['-c', '-n', '-p', '-P', '-u', '--class', '--classdata'] },
  time: { value: ['-f', '-o', '--format', '--output'] },
  command: {},
  builtin: {},
  exec: { value: ['-a'] },
  xargs: { value: ['-a', '-d', '-E', '-I', '-L', '-n', '-P', '-s', '--arg-file', '--delimiter', '--max-args', '--max-procs', '--max-chars'] },
  env: { value: ['-u', '-C', '--unset', '--chdir'], assignments: true },
  timeout: { value: ['-s', '-k', '--signal', '--kill-after'], positional: 1 },
  busybox: {},
  chroot: { value: ['--userspec', '--groups'], positional: 1 },
  flock: { value: ['-w', '-E', '--timeout', '--conflict-exit-code'], positional: 1 },
  unbuffer: {},
  strace: { value: ['-e', '-o', '-p', '-s', '-u'] },
  pkexec: { value: ['--user'] },
  runuser: { value: ['-u', '-g', '-G', '--user', '--group', '--supp-group'] },
  // Windows Subsystem for Linux runs its argv inside the distribution (same files via /mnt/c).
  wsl: { value: ['-d', '-u', '--distribution', '--user', '--cd'] }
};

const SHELL_KEYWORDS = new Set(['if', 'then', 'else', 'elif', 'do', 'while', 'until', '!']);

function stripWrappers(tokens) {
  let rest = tokens;
  // Bounded loop: each pass consumes at least one token.
  for (let guard = 0; guard < 16 && rest.length; guard += 1) {
    // Bare `VAR=value cmd` assignments, PowerShell/grouping punctuation (`& cmd`, `{ cmd }`), and
    // shell reserved words that precede a command (`then rm …`, `do rm …`, `! rm …`; F72).
    let i = 0;
    while (i < rest.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(rest[i]) || /^[&({]$/.test(rest[i])
      || SHELL_KEYWORDS.has(rest[i].toLowerCase()))) i += 1;
    if (i > 0) {
      if (i >= rest.length) return rest;
      rest = rest.slice(i);
      continue;
    }
    const spec = ARGV_WRAPPERS[cmdName(rest[0])];
    if (!spec) return rest;
    const value = new Set(spec.value || []);
    i = 1;
    while (i < rest.length && /^-/.test(rest[i])) {
      const flag = rest[i];
      i += 1;
      if (flag === '--') break;
      if (value.has(flag)) i += 1;
    }
    if (spec.assignments) while (i < rest.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(rest[i])) i += 1;
    i += spec.positional || 0;
    // A wrapper with no wrapped command (`sudo -v`, `env`, `nohup`) runs nothing dangerous.
    if (i >= rest.length) return rest;
    rest = rest.slice(i);
  }
  return rest;
}

// Interpreters that take a literal script string. Only the literal text is re-scanned — nothing
// is evaluated — so `bash -c "$CMD"` stays out of scope.
const POSIX_SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'ash', 'fish']);

function interpreterScript(tokens) {
  const name = cmdName(tokens[0]);
  const rest = tokens.slice(1);
  if (POSIX_SHELLS.has(name)) {
    // -c may be bundled (`bash -lc`, `sh -ec`). Only the NEXT word is the script; later words are
    // $0, $1… (`bash -c rm -rf X` really runs a bare `rm`).
    const at = rest.findIndex((t) => /^-[a-z]*c[a-z]*$/i.test(t));
    return at >= 0 && at + 1 < rest.length ? rest[at + 1] : null;
  }
  if (name === 'su' || name === 'runuser') {
    const at = rest.findIndex((t) => t === '-c' || t === '--command');
    return at >= 0 && at + 1 < rest.length ? rest[at + 1] : null;
  }
  if (name === 'env') {
    // `env -S "rm -rf /"` splits the string into the command line.
    const at = rest.findIndex((t) => t === '-S' || t === '--split-string');
    return at >= 0 && at + 1 < rest.length ? rest[at + 1] : null;
  }
  if (name === 'cmd') {
    // Everything after /c (or /k) is the command line.
    const at = rest.findIndex((t) => /^\/[ck]$/i.test(t));
    return at >= 0 && at + 1 < rest.length ? rest.slice(at + 1).join(' ') : null;
  }
  if (name === 'powershell' || name === 'pwsh') return powershellArgs(rest).script;
  return null;
}

const MAX_SCRIPT_DEPTH = 3;

function stageDangerous(tokens, depth) {
  if (!tokens.length) return false;
  const unwrapped = stripWrappers(tokens);
  // Judge the unwrapped command, but never let unwrapping make a flagged command look safe.
  if (unwrapped !== tokens && unwrapped.length && stageDangerous(unwrapped, depth)) return true;
  const name = cmdName(tokens[0]);
  if (alwaysDangerousName(name)) return true;
  if (rmDangerous(tokens)) return true;
  if (findDangerous(tokens)) return true;
  if (gitDangerous(tokens)) return true;
  if (packageManagerDangerous(tokens)) return true;
  if (unixSystemDangerous(tokens)) return true;
  if (powershellDangerous(tokens)) return true;
  if (windowsDangerous(tokens)) return true;
  const script = depth < MAX_SCRIPT_DEPTH ? interpreterScript(tokens) : null;
  if (script && commandDangerous(script, depth + 1)) return true;
  const joined = tokens.map((t) => t.toLowerCase()).join(' ');
  if (/\bdrop\s+(?:database|schema)\b/.test(joined)) return true;
  return false;
}

// Download piped into something that executes it. Script interpreters count only when they run
// stdin (`| python`, `| node -`), not `curl … | python -m json.tool`, which is everyday JSON work.
function pipelineDangerous(stages) {
  const fetchers = new Set(['curl', 'wget', 'iwr', 'invoke-webrequest']);
  const shells = new Set([...POSIX_SHELLS, 'cmd', 'powershell', 'pwsh', 'iex', 'invoke-expression']);
  const interpreters = new Set(['python', 'python3', 'node', 'perl', 'ruby']);
  let sawFetch = false;
  for (const stage of stages) {
    const tokens = stripWrappers(tokenize(stage));
    const name = cmdName(tokens[0] || '');
    if (fetchers.has(name)) sawFetch = true;
    if (!sawFetch) continue;
    if (shells.has(name)) return true;
    if (interpreters.has(name) && tokens.slice(1).every((t) => t === '-')) return true;
  }
  return false;
}

function redirectDangerous(raw) {
  const n = normalizeRaw(raw);
  if (/>\s*\/dev\/(?:sd|nvme|hd|vd|xvd|mmcblk|disk)/i.test(n)) return true;
  if (/>\s*\\\\\.\\physicaldrive/i.test(n)) return true;
  return false;
}

function commandDangerous(command, depth) {
  const raw = String(command || '');
  if (!raw.trim()) return false;
  return readings(raw).some((text) => {
    if (redirectDangerous(text)) return true;
    const stages = splitStages(text);
    if (pipelineDangerous(stages)) return true;
    return stages.some((st) => stageDangerous(tokenize(st), depth));
  });
}

function isDangerousCommand(command) {
  return commandDangerous(command, 0);
}

module.exports = { isDangerousCommand };
