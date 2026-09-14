'use strict';

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

const DANGEROUS = /\b(?:rm\s+-[rR]{0,2}f|rm\s+-r\s+-f|Remove-Item\b.*-(?:Recurse|Force)|del\s+\/s|rd\s+\/s|format\s+[a-zA-Z]:|git\s+push\b|git\s+reset\s+--hard|git\s+clean\s+-f|drop\s+database|curl\b[\s\S]*\|\s*(?:sh|bash|powershell)|iex\b|Invoke-Expression\b|iwr\b[\s\S]*\|\s*)/i;

function isReadishCommand(command) {
  return READISH.test(String(command || '').trim());
}

function looksDangerousCommand(command) {
  return DANGEROUS.test(String(command || '')) || EXTRA_DANGER.test(String(command || ''));
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

module.exports = {
  scrubEnv,
  isReadishCommand,
  looksDangerousCommand,
  commandFamily,
  shouldAutoAllow
};
