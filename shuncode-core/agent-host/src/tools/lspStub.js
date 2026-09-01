const fs = require('fs');
const { resolveSafePath } = require('./patchEngine');

function lsp({ action = 'hover', filePath, query = '' } = {}) {
  if (!filePath) {
    return {
      action,
      note: 'LSP 需要 filePath。本复现主机未挂完整语言服务，返回基于文本的近似结果。',
      results: []
    };
  }
  const full = resolveSafePath(filePath);
  if (!fs.existsSync(full)) {
    throw new Error(`File not found: "${filePath}"`);
  }
  const content = fs.readFileSync(full, 'utf8');
  const lines = content.split(/\r?\n/);
  const results = [];
  const needle = query || '';
  if (needle) {
    lines.forEach((line, idx) => {
      if (line.includes(needle)) {
        results.push({ file: filePath, line: idx + 1, text: line.trim() });
      }
    });
  }
  return {
    action,
    filePath,
    language: filePath.endsWith('.js') ? 'javascript' : 'plaintext',
    note: '近似符号检索（未连接 VS Code 语言服务进程）。',
    results: results.slice(0, 40)
  };
}

function getDiagnostics({ filePath } = {}) {
  const diagnostics = [];
  const targets = filePath ? [filePath] : ['src/calculator.js', 'tests/calculator.test.js'];
  for (const fp of targets) {
    try {
      const full = resolveSafePath(fp);
      if (!fs.existsSync(full)) continue;
      const text = fs.readFileSync(full, 'utf8');
      if (fp.includes('calculator.js') && /function divide/.test(text) && !/Cannot divide by zero/.test(text)) {
        diagnostics.push({
          filePath: fp,
          severity: 'warning',
          line: text.split(/\r?\n/).findIndex((l) => l.includes('function divide')) + 1,
          message: 'divide() 缺少除以零守卫，测试用例 tests/calculator.test.js 预期抛出异常。'
        });
      }
    } catch {
      /* skip */
    }
  }
  return { diagnostics };
}

module.exports = { lsp, getDiagnostics };
