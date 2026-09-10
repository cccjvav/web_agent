const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workspace = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(workspace, 'index.html'), 'utf8');
const styles = fs.readFileSync(path.join(workspace, 'styles.css'), 'utf8');
const behavior = fs.readFileSync(path.join(workspace, 'app.js'), 'utf8');

function test(name, check) {
  try {
    check();
    console.log(`  ✅ PASS: ${name}`);
  } catch (error) {
    console.error(`  ❌ FAIL: ${name}`);
    throw error;
  }
}

console.log('🎨 Checking Tideway SVG page...');
test('page has an accessible inline SVG scene', () => {
  assert.match(page, /id="rideScene"[\s\S]*?role="img"/);
  assert.match(page, /鹈鹕骑自行车/);
});

test('scene uses native SMIL animation primitives', () => {
  assert.ok((page.match(/<animate(?:Transform)?\b/g) || []).length >= 10);
  assert.match(page, /repeatCount="indefinite"/);
});

test('page has no raster image dependency', () => {
  assert.doesNotMatch(page, /<img\b|<canvas\b|https?:\/\/[^'" ]+\.(?:png|jpe?g|webp|gif)/i);
});

test('motion controls can pause and replay the SVG timeline', () => {
  assert.match(behavior, /pauseAnimations/);
  assert.match(behavior, /setCurrentTime\(0\)/);
});

test('layout includes reduced-motion support', () => {
  assert.match(styles, /prefers-reduced-motion/);
});

console.log('🎉 SVG page checks passed.');
