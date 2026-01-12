import { strict as assert } from 'node:assert';

const rootSuites = [];
let currentSuite = null;

class Suite {
  constructor(name) {
    this.name = name;
    this.children = [];
    this.tests = [];
  }
}

class Test {
  constructor(name, fn) {
    this.name = name;
    this.fn = fn;
  }
}

function getActiveSuite() {
  if (!currentSuite) {
    const suite = new Suite('(root)');
    rootSuites.push(suite);
    currentSuite = suite;
  }
  return currentSuite;
}

export function describe(name, fn) {
  const parent = getActiveSuite();
  const suite = new Suite(name);
  parent.children.push(suite);
  const previous = currentSuite;
  currentSuite = suite;
  try {
    fn();
  } finally {
    currentSuite = previous;
  }
}

export function it(name, fn) {
  const suite = getActiveSuite();
  suite.tests.push(new Test(name, fn));
}

export const test = it;

function isPromise(value) {
  return Boolean(value) && typeof value.then === 'function';
}

function formatError(error) {
  if (!error) return 'Unknown error';
  if (error.stack) return error.stack;
  if (error.message) return error.message;
  return String(error);
}

export function expect(actual) {
  return {
    toBe(expected) {
      assert.strictEqual(actual, expected);
    },
    toEqual(expected) {
      assert.deepStrictEqual(actual, expected);
    },
    toBeTruthy() {
      assert.ok(actual);
    },
    toBeFalsy() {
      assert.ok(!actual);
    }
  };
}

export async function runSuites({ reporter = console } = {}) {
  let failures = 0;
  let executed = 0;

  async function runSuite(suite, depth = 0) {
    const indent = '  '.repeat(Math.max(depth - 1, 0));
    if (suite.name && suite.name !== '(root)' && suite.tests.length) {
      reporter.log(`${indent}${suite.name}`);
    }
    for (const child of suite.children) {
      await runSuite(child, depth + 1);
    }
    for (const test of suite.tests) {
      try {
        const result = test.fn();
        if (isPromise(result)) {
          await result;
        }
        reporter.log(`${'  '.repeat(depth)}✓ ${test.name}`);
        executed += 1;
      } catch (error) {
        failures += 1;
        reporter.error(`${'  '.repeat(depth)}✗ ${test.name}`);
        reporter.error(formatError(error));
      }
    }
  }

  for (const suite of rootSuites) {
    await runSuite(suite);
  }

  reporter.log(`Ran ${executed} test${executed === 1 ? '' : 's'}.`);
  return failures;
}

export function resetSuites() {
  rootSuites.length = 0;
  currentSuite = null;
}

export default {
  describe,
  it,
  test,
  expect,
  runSuites,
  resetSuites
};
