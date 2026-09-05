function productVersion() {
  try {
    const pkg = require('../../extension/package.json');
    if (pkg && pkg.version) return String(pkg.version);
  } catch (_) {}
  return '0.6.9';
}

module.exports = { productVersion };
