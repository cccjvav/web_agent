/**
 * Calculator Core Module - ShunCode Code-OSS Carrier Demo
 */

function add(a, b) {
  return a + b;
}

function subtract(a, b) {
  return a - b;
}

function multiply(a, b) {
  return a * b;
}

function divide(a, b) {
  // BUG to be fixed by ShunCode Agent (apply_patch):
  // Needs division by zero guard!
  return a / b;
}

function power(base, exponent) {
  return Math.pow(base, exponent);
}

module.exports = {
  add,
  subtract,
  multiply,
  divide,
  power
};
