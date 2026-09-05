function toolLabel(name, result, ok) {
  if (!ok) {
    if (name === 'list_directory' || name === 'list_dir') return 'Explored .';
    if (name === 'read_files' || name === 'read_file') return 'Read files';
    return name;
  }
  if (name === 'list_directory' || name === 'list_dir') {
    return `Explored ${(result && result.dirPath) || '.'}`;
  }
  if (name === 'find_files') {
    const n = (result && (result.total ?? (result.files && result.files.length))) || 0;
    return `Found ${n} files`;
  }
  if (name === 'search_files' || name === 'grep_search') {
    const n = (result && result.totalMatches) || 0;
    return `Found ${n} matches`;
  }
  if (name === 'read_files' || name === 'read_file') {
    if (result && Array.isArray(result.files)) return `Read ${result.files.length} files`;
    if (result && result.filePath) return `Read ${result.filePath}`;
    return 'Read files';
  }
  if (name === 'run_command' || name === 'execute_command') {
    return result && result.command ? result.command : 'Run command';
  }
  if (name === 'apply_patch') return result && result.filePath ? `Patched ${result.filePath}` : 'apply_patch';
  if (name === 'git_status') return 'git status';
  if (name === 'set_todos') return 'Tasks';
  return name;
}

module.exports = { toolLabel };
