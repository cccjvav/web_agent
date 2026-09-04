const TOOL_NAME_ALIASES = {
  bash: 'run_command',
  shell: 'run_command',
  exec: 'run_command',
  execute: 'run_command',
  str_replace: 'apply_patch',
  search_replace: 'apply_patch',
  replace_in_file: 'apply_patch',
  edit_file: 'apply_patch',
  cat: 'read_files',
  read: 'read_files',
  ls: 'list_directory',
  grep: 'search_files',
  glob: 'find_files',
  write: 'write_file',
  create_file: 'write_file',
  rm: 'delete_file',
  mv: 'rename_file'
};

function isTruthy(v) {
  if (v === true || v === 1) return true;
  if (typeof v === 'string' && /^(true|yes|1)$/i.test(v.trim())) return true;
  return false;
}

function firstDefined(obj, keys) {
  for (const k of keys) {
    if (obj[k] != null && obj[k] !== '') return obj[k];
  }
  return undefined;
}

function resolveToolName(name) {
  const raw = String(name || '').trim();
  if (!raw) return raw;
  if (TOOL_NAME_ALIASES[raw]) return TOOL_NAME_ALIASES[raw];
  const lower = raw.toLowerCase();
  if (TOOL_NAME_ALIASES[lower]) return TOOL_NAME_ALIASES[lower];
  return raw;
}

function normalizeToolArgs(toolName, args) {
  const src = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
  const a = { ...src };

  if (a.file_path != null && a.filePath == null) a.filePath = a.file_path;
  if (a.dir_path != null && a.dirPath == null) a.dirPath = a.dir_path;
  if (a.search_path != null && a.searchPath == null) a.searchPath = a.search_path;
  if (a.expected_hash != null && a.expectedHash == null) a.expectedHash = a.expected_hash;
  if (a.dry_run != null && a.dryRun == null) a.dryRun = a.dry_run;
  if (a.max_depth != null && a.maxDepth == null) a.maxDepth = a.max_depth;
  if (a.max_results != null && a.maxResults == null) a.maxResults = a.max_results;
  if (a.timeout_sec != null && a.timeoutSec == null) a.timeoutSec = a.timeout_sec;
  if (a.exec_id != null && a.execId == null) a.execId = a.exec_id;
  if (a.is_regex != null && a.isRegex == null) a.isRegex = a.is_regex;
  if (a.case_sensitive != null && a.caseSensitive == null) a.caseSensitive = a.case_sensitive;
  if (a.confirmOverwrite != null && a.confirm_overwrite == null) a.confirm_overwrite = a.confirmOverwrite;
  if (a.confirmDangerous != null && a.confirm_dangerous == null) a.confirm_dangerous = a.confirmDangerous;

  switch (toolName) {
    case 'read_files':
    case 'apply_patch':
    case 'write_file':
    case 'delete_file':
    case 'git_diff': {
      const fp = firstDefined(a, ['filePath', 'path', 'file', 'filename', 'filepath', 'target']);
      if (fp != null) a.filePath = fp;
      break;
    }
    default:
      break;
  }

  if (toolName === 'list_directory') {
    const d = firstDefined(a, ['dirPath', 'path', 'dir', 'directory', 'folder']);
    if (d != null) a.dirPath = d;
  }

  if (toolName === 'search_files') {
    const q = firstDefined(a, ['query', 'pattern', 'text', 'q', 'search']);
    if (q != null) a.query = q;
    const sp = firstDefined(a, ['searchPath', 'path']);
    if (sp != null) a.searchPath = sp;
  }

  if (toolName === 'find_files') {
    const g = firstDefined(a, ['glob', 'pattern', 'glob_pattern']);
    if (g != null) a.glob = g;
    const sp = firstDefined(a, ['searchPath', 'path']);
    if (sp != null) a.searchPath = sp;
  }

  if (toolName === 'apply_patch') {
    const p = firstDefined(a, ['patch', 'diff', 'edits', 'content']);
    if (p != null) a.patch = p;
    const h = firstDefined(a, ['expectedHash', 'hash', 'sha256', 'file_hash']);
    if (h != null) a.expectedHash = h;
    a.dryRun = isTruthy(a.dryRun);
  }

  if (toolName === 'write_file') {
    const c = firstDefined(a, ['content', 'text', 'body']);
    if (c != null) a.content = c;
    const h = firstDefined(a, ['expectedHash', 'hash', 'sha256']);
    if (h != null) a.expectedHash = h;
    a.confirm_overwrite = isTruthy(a.confirm_overwrite);
    a.confirmOverwrite = a.confirm_overwrite;
  }

  if (toolName === 'delete_file') {
    a.confirm = isTruthy(a.confirm);
  }

  if (toolName === 'rename_file') {
    const from = firstDefined(a, ['from', 'source', 'src', 'old_path', 'filePath']);
    const to = firstDefined(a, ['to', 'dest', 'destination', 'dst', 'new_path']);
    if (from != null) a.from = from;
    if (to != null) a.to = to;
  }

  if (toolName === 'run_command' || toolName === 'start_command') {
    const cmd = firstDefined(a, ['command', 'cmd', 'shell']);
    if (cmd != null) a.command = cmd;
    const t = firstDefined(a, ['timeoutSec', 'timeout']);
    if (t != null) a.timeoutSec = t;
    a.confirm_dangerous = isTruthy(a.confirm_dangerous);
  }

  if (toolName === 'get_command_output' || toolName === 'cancel_command') {
    const id = firstDefined(a, ['execId', 'commandId', 'id']);
    if (id != null) a.execId = id;
  }

  if (toolName === 'list_directory') {
    a.recursive = isTruthy(a.recursive) || a.recursive === true;
  }

  if (toolName === 'search_files') {
    a.isRegex = isTruthy(a.isRegex);
    a.caseSensitive = isTruthy(a.caseSensitive);
  }

  return a;
}

module.exports = { isTruthy, resolveToolName, normalizeToolArgs, TOOL_NAME_ALIASES };
