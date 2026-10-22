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
        if (!Object.prototype.hasOwnProperty.call(actual, key) || !deepMatch(actual[key], expected[key])) return false;
    }

    return true;
}

function hasAsymmetricMatcher(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return false;
  if (typeof value.asymmetricMatch === 'function') return true;
  seen.add(value);
  return Reflect.ownKeys(value).some(key => hasAsymmetricMatcher(value[key], seen));
}

// Preserve Node's exact equality for ordinary values, including Maps and cycles.
// Recurse only where an asymmetric matcher needs to inspect part of the value.
function exactMatch(actual, expected) {
  if (expected && typeof expected.asymmetricMatch === 'function') return expected.asymmetricMatch(actual);
  if (!hasAsymmetricMatcher(expected)) {
    try { assert.deepStrictEqual(actual, expected); return true; } catch { return false; }
  }
  if (Object.is(actual, expected)) return true;
  if (!actual || !expected || typeof actual !== 'object' || typeof expected !== 'object') return false;
  if (Object.getPrototypeOf(actual) !== Object.getPrototypeOf(expected)) return false;
  if (!Array.isArray(expected) && Object.getPrototypeOf(expected) !== Object.prototype) {
    try { assert.deepStrictEqual(actual, expected); return true; } catch { return false; }
  }
  const keys = Reflect.ownKeys(expected);
  return keys.length === Reflect.ownKeys(actual).length && keys.every(key =>
    Object.prototype.hasOwnProperty.call(actual, key) && exactMatch(actual[key], expected[key]));
}

export function expect(actual, message = undefined) {
  const matchers = {
    toBe(expected) {
      assert.strictEqual(actual, expected);
    },
    toEqual(expected) {
      assert.ok(exactMatch(actual, expected), message ?? 'Expected deeply equal values');
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
    },
    toHaveBeenCalledTimes(expected) {
        const calls = actual.mock?.calls || [];
        assert.strictEqual(calls.length, expected);
    },
    toThrow(expected) {
      assert.equal(typeof actual, 'function', 'toThrow requires a function');
      let thrown = false, error;
      try { actual(); } catch (reason) { thrown = true; error = reason; }
      assert.ok(thrown, 'Expected function to throw');
      if (expected instanceof RegExp) assert.match(String(error?.message ?? error), expected);
      else if (typeof expected === 'string') assert.ok(String(error?.message ?? error).includes(expected));
      else if (typeof expected === 'function') assert.ok(error instanceof expected);
      else if (expected instanceof Error) assert.equal(error?.message, expected.message);
    },
    toMatchObject(expected) { assert.ok(deepMatch(actual, expected), 'Expected matching object fields'); },
    toMatch(expected) {
      if (expected instanceof RegExp) assert.match(actual, expected);
      else assert.ok(actual.includes(expected));
    },
    toBeGreaterThan(expected) { assert.ok(actual > expected, `${actual} must be > ${expected}`); },
    toBeGreaterThanOrEqual(expected) { assert.ok(actual >= expected); },
    toBeLessThan(expected) { assert.ok(actual < expected, `${actual} must be < ${expected}`); },
    toBeLessThanOrEqual(expected) { assert.ok(actual <= expected); },
    toBeUndefined() { assert.equal(actual, undefined); },
    toBeDefined() { assert.notEqual(actual, undefined); },
    toBeTypeOf(expected) { assert.equal(typeof actual, expected); },
    toBeInstanceOf(expected) { assert.ok(actual instanceof expected); },
    toHaveProperty(property, expected) {
      const parts = Array.isArray(property) ? property : property.split('.');
      let value = actual;
      for (const key of parts) {
        assert.ok(value != null && Object.prototype.hasOwnProperty.call(value, key), `Missing property ${property}`);
        value = value[key];
      }
      if (arguments.length > 1) assert.deepStrictEqual(value, expected);
    }
  };
  matchers.not = new Proxy(matchers.not, {
    get(_target, name) {
      if (typeof matchers[name] !== 'function') throw new Error(`Unsupported matcher: ${String(name)}`);
      return (...args) => {
        try { matchers[name](...args); }
        catch (error) { if (error instanceof assert.AssertionError) return; throw error; }
        assert.fail(`Expected ${String(name)} assertion not to match`);
      };
    }
  });
  Object.defineProperty(matchers, 'rejects', {
    get() {
      // Attach a rejection handler immediately so rejected promises cannot
      // escape the test runner as an unhandled rejection.
      const outcome = Promise.resolve(actual).then(
        value => ({ rejected: false, value }),
        value => ({ rejected: true, value })
      );
      return new Proxy({}, {
        get(_target, name) {
          return async (...args) => {
            const result = await outcome;
            assert.ok(result.rejected, 'Expected promise to reject');
            const value = name === 'toThrow' ? () => { throw result.value; } : result.value;
            return expect(value)[name](...args);
          };
        }
      });
    }
  });
  return matchers;
}

expect.objectContaining = function(expected) {
  return { asymmetricMatch(actual) { return actual !== null && typeof actual === 'object' && deepMatch(actual, expected); } };
};

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
      executed += 1;
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

  reporter.log(`Ran ${executed} test${executed === 1 ? '' : 's'}: ${executed - failures} passed, ${failures} failed.`);
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
