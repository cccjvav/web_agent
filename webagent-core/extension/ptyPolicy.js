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

// Keep the last `limit` UTF-16 units of `text` without splitting a surrogate pair. A plain
// `.slice(-limit)` can start on the low half of an emoji or CJK Extension B character, leaving a
// lone surrogate that renders as U+FFFD and is not valid Unicode to send to a model.
// Shared by the host executor/PTY job store and this extension's ptyHost output buffers.
function sliceTextTail(text, limit) {
  const s = String(text == null ? '' : text);
  const n = Math.max(0, Math.floor(Number(limit) || 0));
  if (s.length <= n) return s;
  let start = s.length - n;
  const code = s.charCodeAt(start);
  if (code >= 0xdc00 && code <= 0xdfff) start += 1; // Drop the orphaned low surrogate.
  return s.slice(start);
}


function isReadishCommand(command) {
  return READISH.test(String(command || '').trim());
}

function looksDangerousCommand(command) {
  return isDangerousCommand(command) || EXTRA_DANGER.test(String(command || ''));
}

// The family is the whole first word, and only when it is a bare program name. The old prefix match took the
// first [A-Za-z0-9_.+-]+ run, so `"C:\\…\\node.exe"` had family "c" and `./a.sh` had ".": one 同类都允许 then
// auto-ran every C:\\ program or every ./ script (F71). Path-like programs have no family and must be approved
// one by one (or via the explicit whole-session choice).
function commandFamily(command) {
  const t = String(command || '').trim().replace(/^&\s*/, '');
  const m = t.match(/^(?:"([^"]*)"|'([^']*)'|([^\s"']+))(?=\s|$)/);
  const word = m ? (m[1] ?? m[2] ?? m[3]) : '';
  return /^[A-Za-z0-9_][A-Za-z0-9_.+-]*$/.test(word) ? word.toLowerCase() : '';
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

module.exports = {
  scrubEnv,
  sliceTextTail,
  isReadishCommand,
  looksDangerousCommand,
  commandFamily,
  shouldAutoAllow
};
