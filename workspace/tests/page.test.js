const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workspace = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(workspace, 'index.html'), 'utf8');

function test(name, check) {
  try {
    check();
    console.log(`  ✅ PASS: ${name}`);
  } catch (error) {
    console.error(`  ❌ FAIL: ${name}`);
    throw error;
  }
}

console.log('🎨 Checking PEL-01 single-file SVG page...');
test('page has an accessible inline SVG scene', () => {
  assert.match(page, /id="rideScene"[\s\S]*?role="img"/);
  assert.match(page, /鹈鹕骑自行车/);
});

test('scene uses native SMIL animation primitives', () => {
  assert.ok((page.match(/<animate(?:Transform)?\b/g) || []).length >= 15);
  assert.match(page, /repeatCount="indefinite"/);
  assert.match(page, /dur="1\.2s"/);
});

test('page includes two-link IK leg chains', () => {
  assert.match(page, /id="ikLegs"/);
  assert.match(page, /class="upper-leg"/);
  assert.match(page, /class="lower-leg"/);
  assert.match(page, /IK LOCKED/);
  assert.match(page, /脚掌全程贴合脚踏/);
});

test('single file has no external page dependencies', () => {
  assert.doesNotMatch(page, /<link\b|<img\b|<canvas\b|<script\b[^>]+src=/i);
  assert.doesNotMatch(page, /https?:\/\/[^'" ]+\.(?:png|jpe?g|webp|gif|js|css)/i);
});

test('space and button controls can pause and replay the SVG timeline', () => {
  assert.match(page, /pauseAnimations/);
  assert.match(page, /setCurrentTime\(0\)/);
  assert.match(page, /event\.code !== 'Space'/);
  assert.match(page, /id="pauseButton"/);
  assert.match(page, /id="replayButton"/);
});

test('layout includes reduced-motion support', () => {
  assert.match(page, /prefers-reduced-motion/);
});

console.log('🎉 Single-file SVG page checks passed.');
