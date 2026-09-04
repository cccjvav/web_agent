const assert = require('assert');
const { add, subtract, multiply, divide, power } = require('../src/calculator');

console.log('🚀 Running Web Agent Workspace Test Suite...');
console.log('----------------------------------------------------');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    failed++;
  }
}

test('add(2, 3) should equal 5', () => {
  assert.strictEqual(add(2, 3), 5);
});

test('subtract(10, 4) should equal 6', () => {
  assert.strictEqual(subtract(10, 4), 6);
});

test('multiply(6, 7) should equal 42', () => {
  assert.strictEqual(multiply(6, 7), 42);
});

test('divide(10, 2) should equal 5', () => {
  assert.strictEqual(divide(10, 2), 5);
});

test('divide(10, 0) should throw "Cannot divide by zero"', () => {
  assert.throws(() => {
    divide(10, 0);
  }, /Cannot divide by zero/);
});

console.log('----------------------------------------------------');
console.log(`Summary: ${passed} passed, ${failed} failed.`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('🎉 All workspace tests passed successfully!');
  process.exit(0);
}
