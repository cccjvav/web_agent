function productVersion() {
  const pkg = require('../../extension/package.json');
  if (!pkg || typeof pkg.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version)) {
    throw new Error('Invalid extension/package.json version');
  }
  return pkg.version;
}

module.exports = { productVersion };
