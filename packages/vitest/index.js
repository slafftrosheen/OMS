import { strict as assert } from 'node:assert';

const rootSuites = [];
let currentSuite = null;

class Suite {
  constructor(name, parent) {
    this.name = name;
    this.parent = parent;
    this.children = [];
    this.tests = [];
    this.beforeEachFns = [];
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
    const suite = new Suite('(root)', null);
    rootSuites.push(suite);
    currentSuite = suite;
  }
  return currentSuite;
}

export function describe(name, fn) {
  const parent = getActiveSuite();
  const suite = new Suite(name, parent);
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

export function beforeEach(fn) {
    const suite = getActiveSuite();
    suite.beforeEachFns.push(fn);
}

function isPromise(value) {
  return Boolean(value) && typeof value.then === 'function';
}

function formatError(error) {
  if (!error) return 'Unknown error';
  if (error.stack) return error.stack;
  if (error.message) return error.message;
  return String(error);
}

function deepMatch(actual, expected) {
    if (expected && typeof expected === 'object' && expected.asymmetricMatch) {
        return expected.asymmetricMatch(actual);
    }

    if (actual === expected) return true;

    if (typeof actual !== 'object' || actual === null || typeof expected !== 'object' || expected === null) {
        return false;
    }

    if (Array.isArray(expected)) {
        if (!Array.isArray(actual) || actual.length !== expected.length) return false;
        return expected.every((val, i) => deepMatch(actual[i], val));
    }

    const keys = Object.keys(expected);
    for (const key of keys) {
        if (!deepMatch(actual[key], expected[key])) return false;
    }

    return true;
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
    },
    toHaveLength(length) {
        assert.strictEqual(actual.length, length);
    },
    toBeNull() {
        assert.strictEqual(actual, null);
    },
    not: {
        toBeNull() {
            assert.notStrictEqual(actual, null);
        },
        toContain(item) {
            assert.ok(!actual.includes(item));
        }
    },
    toContain(item) {
        assert.ok(actual.includes(item));
    },
    toHaveBeenCalledWith(...args) {
        // Mock implementation for vi.fn()
        const calls = actual.mock.calls;
        const matchingCall = calls.find(call => {
            if (call.length !== args.length) return false;
            return call.every((arg, i) => deepMatch(arg, args[i]));
        });
        assert.ok(matchingCall, `Expected to have been called with ${JSON.stringify(args)}`);
    }
  };
}

expect.any = function(constructor) {
    return {
        asymmetricMatch(actual) {
            if (constructor === String) return typeof actual === 'string';
            if (constructor === Object) return typeof actual === 'object' && actual !== null;
            return actual instanceof constructor;
        }
    };
};

export const vi = {
    fn(impl) {
        let mockImpl = impl;
        const mock = function(...args) {
            mock.mock.calls.push(args);
            if (mockImpl) return mockImpl(...args);
        };
        mock.mock = { calls: [] };
        mock.mockResolvedValue = (val) => {
            mockImpl = () => Promise.resolve(val);
            return mock;
        };
        mock.mockRejectedValue = (val) => {
            mockImpl = () => Promise.reject(val);
            return mock;
        };
        mock.mockImplementation = (newImpl) => {
            mockImpl = newImpl;
            return mock;
        };
        return mock;
    }
};

export async function runSuites({ reporter = console } = {}) {
  let failures = 0;
  let executed = 0;

  async function runSuite(suite, depth = 0) {
    const indent = '  '.repeat(Math.max(depth - 1, 0));
    if (suite.name && suite.name !== '(root)' && suite.tests.length) {
      reporter.log(`${indent}${suite.name}`);
    }

    // Collect all beforeEach functions from root down to current suite
    let ancestors = [];
    let curr = suite;
    while (curr) {
        ancestors.unshift(curr);
        curr = curr.parent;
    }

    for (const test of suite.tests) {
      try {
        // Run all beforeEach functions from ancestors
        for (const ancestor of ancestors) {
            for (const fn of ancestor.beforeEachFns) {
                await fn();
            }
        }

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

    for (const child of suite.children) {
      await runSuite(child, depth + 1);
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
  beforeEach,
  vi,
  runSuites,
  resetSuites
};
