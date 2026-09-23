'use strict';
const { isDangerousCommand } = require('./dangerousPolicy');

const READISH = /^(?:pwd|whoami|hostname|git status(?: --short| --porcelain| --branch| -s| -b| -sb)*|git rev-parse --show-toplevel|ls|dir|Get-ChildItem|echo [A-Za-z0-9 ._-]+)$/i;
// Content reads (including Git history) always require per-command approval:
// lexical path filtering cannot prove symlink safety or absence of tracked secrets.
const CONTENT_READ = /^(?:(?:cat|type|get-content)(?:\s|$)|git\s+(?:diff|log|show)(?:\s|$))/i;
const EXTRA_DANGER = /\b(?:dd|shred|truncate|mkfs(?:\.[a-z0-9]+)?|invoke-webrequest|iwr|start-process|bitsadmin|schtasks)\b|\bnpm\s+publish\b/i;

function scrubEnv(base) {
  const out = { ...(base || {}) };
  for (const key of Object.keys(out)) {
    if (/(?:api[_-]?key|access[_-]?key|secret|password|credential|private[_-]?key|token|(?:^|_)storage_key$)/i.test(key)) delete out[key];
  }
  return out;
}

const COMPOUND = /[;&|<>`$(){}\r\n]/;


function isReadishCommand(command) {
  return READISH.test(String(command || '').trim());
}

function looksDangerousCommand(command) {
  return isDangerousCommand(command) || EXTRA_DANGER.test(String(command || ''));
}

function commandFamily(command) {
  const t = String(command || '').trim().replace(/^&\s*/, '');
  const m = t.match(/^["']?([A-Za-z0-9_.+-]+)/);
  return m ? m[1].toLowerCase() : '';
}

function shouldAutoAllow(command, state = {}) {
  const family = commandFamily(command);
  if (CONTENT_READ.test(String(command || '').trim()) || COMPOUND.test(String(command || '')) || looksDangerousCommand(command)) {
    return { allow: false, alwaysAsk: true, family };
  }
  if (isReadishCommand(command)) {
    return { allow: true, reason: 'readish', family };
  }
  if (state.allowSession) {
    return { allow: true, reason: 'session', family };
  }
  if (family && state.allowedFamilies && state.allowedFamilies.has(family)) {
    return { allow: true, reason: 'family', family };
  }
  return { allow: false, alwaysAsk: false, family };
}

// String.prototype.slice cuts on UTF-16 code units. When the cut lands inside a surrogate pair
// (emoji, CJK Extension B), the surviving text starts with an orphaned low surrogate that JSON
// round-trips into a replacement character — readers then see garbage the program never printed.
// Trim the orphan half instead. Shared by the host executor/ptyJobs and the extension ptyHost.
function sliceTextTail(text, limit) {
  const s = String(text == null ? '' : text);
  if (s.length <= limit) return s;
  const dropped = s.slice(0, s.length - limit);
  const kept = s.slice(s.length - limit);
  // The head we dropped ended with a high surrogate → the tail begins with its now-orphaned half.
  return /[\ud800-\udbff]$/.test(dropped) ? kept.slice(1) : kept;
}

module.exports = {
  scrubEnv,
  isReadishCommand,
  looksDangerousCommand,
  commandFamily,
  shouldAutoAllow,
  sliceTextTail
};
