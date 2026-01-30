import { strict as assert } from 'node:assert';

const rootSuites = [];
let currentSuite = null;

class Suite {
  constructor(name, parent = null) {
    this.name = name;
    this.parent = parent;
    this.children = [];
    this.tests = [];
    this.beforeEach = [];
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
  suite.beforeEach.push(fn);
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

export const vi = {
  fn: (impl) => {
    const mock = (...args) => {
      mock.calls.push(args);
      return impl ? impl(...args) : undefined;
    };
    mock.calls = [];
    mock.mockReturnValue = (val) => {
      impl = () => val;
      return mock;
    };
    mock.mockResolvedValue = (val) => {
      impl = () => Promise.resolve(val);
      return mock;
    };
    mock.mockRejectedValue = (val) => {
      impl = () => Promise.reject(val);
      return mock;
    };
    mock.mockImplementation = (newImpl) => {
      impl = newImpl;
      return mock;
    };
    return mock;
  },
  mockResolvedValue: (val) => {
    return Promise.resolve(val);
  }
};

export function expect(actual) {
  const matchers = {
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
    toBeNull() {
      assert.strictEqual(actual, null);
    },
    toBeDefined() {
      assert.notStrictEqual(actual, undefined);
    },
    toThrow(expected) {
        if (typeof actual !== 'function') {
            throw new Error('Received value must be a function');
        }
        try {
            actual();
        } catch (error) {
            if (expected) {
                // naive check for error message match
                assert.ok(error.message.includes(expected) || error.toString().includes(expected));
            }
            return;
        }
        throw new Error('Expected function to throw an error');
    },
    toHaveLength(expected) {
        assert.strictEqual(actual.length, expected);
    },
    toContain(expected) {
        assert.ok(actual.includes(expected), `Expected ${JSON.stringify(actual)} to contain ${JSON.stringify(expected)}`);
    },
    toHaveBeenCalledWith(...expectedArgs) {
      if (!actual || !actual.calls) {
        throw new Error('Expected a mock function');
      }
      const match = actual.calls.some(callArgs => {
        try {
          // Check matchers first
          if (checkMatchers(callArgs, expectedArgs)) return true;

          assert.deepStrictEqual(callArgs, expectedArgs);
          return true;
        } catch {
          return false;
        }
      });
      assert.ok(match, `Expected mock to have been called with ${JSON.stringify(expectedArgs)}, but calls were ${JSON.stringify(actual.calls)}`);
    }
  };

  matchers.resolves = {
    toBe(expected) {
        return Promise.resolve(actual).then(res => assert.strictEqual(res, expected));
    },
    toEqual(expected) {
        return Promise.resolve(actual).then(res => assert.deepStrictEqual(res, expected));
    }
  };

  matchers.not = {
    toBe(expected) {
      assert.notStrictEqual(actual, expected);
    },
    toEqual(expected) {
      assert.notDeepStrictEqual(actual, expected);
    },
    toBeTruthy() {
      assert.strictEqual(!actual, true);
    },
    toBeFalsy() {
      assert.strictEqual(!!actual, true);
    },
    toBeNull() {
      assert.notStrictEqual(actual, null);
    },
    toBeDefined() {
        assert.strictEqual(actual, undefined);
    },
    toHaveLength(expected) {
        assert.notStrictEqual(actual.length, expected);
    },
    toContain(expected) {
        assert.ok(!actual.includes(expected), `Expected ${JSON.stringify(actual)} NOT to contain ${JSON.stringify(expected)}`);
    },
    toHaveBeenCalledWith(...expectedArgs) {
        if (!actual || !actual.calls) {
            throw new Error('Expected a mock function');
        }
        const match = actual.calls.some(callArgs => {
            try {
                // Check matchers first
                if (checkMatchers(callArgs, expectedArgs)) return true;

                assert.deepStrictEqual(callArgs, expectedArgs);
                return true;
            } catch {
                return false;
            }
        });
        assert.ok(!match, `Expected mock NOT to have been called with ${JSON.stringify(expectedArgs)}`);
    }
  };

  return matchers;
}

expect.any = (constructor) => {
    return {
        asymmetricMatch: (other) => {
            if (constructor === String) return typeof other === 'string';
            if (constructor === Number) return typeof other === 'number';
            if (constructor === Boolean) return typeof other === 'boolean';
            if (constructor === Object) return typeof other === 'object' && other !== null;
            if (constructor === Function) return typeof other === 'function';
            return other instanceof constructor;
        },
        [Symbol.for('nodejs.util.inspect.custom')]: () => `Any<${constructor.name}>`
    };
};

const originalDeepStrictEqual = assert.deepStrictEqual;
assert.deepStrictEqual = (actual, expected) => {
    if (expected && typeof expected.asymmetricMatch === 'function') {
        if (!expected.asymmetricMatch(actual)) {
            throw new assert.AssertionError({
                actual,
                expected,
                operator: 'deepStrictEqual',
                message: `Expected ${actual} to match ${expected}`
            });
        }
        return;
    }
    try {
        originalDeepStrictEqual(actual, expected);
    } catch (err) {
        if (checkMatchers(actual, expected)) return;
        throw err;
    }
};

function checkMatchers(actual, expected) {
    if (expected && typeof expected.asymmetricMatch === 'function') {
        return expected.asymmetricMatch(actual);
    }
    if (Array.isArray(actual) && Array.isArray(expected)) {
        if (actual.length !== expected.length) return false;
        return actual.every((v, i) => checkMatchers(v, expected[i]));
    }
    if (typeof actual === 'object' && actual !== null && typeof expected === 'object' && expected !== null) {
        const keys = Object.keys(expected);
        for (const key of keys) {
            if (!checkMatchers(actual[key], expected[key])) return false;
        }
        return true;
    }
    return actual === expected;
}

export async function runSuites({ reporter = console } = {}) {
  let failures = 0;
  let executed = 0;

  function collectHooks(suite) {
    const hooks = [];
    let curr = suite;
    while (curr) {
      if (curr.beforeEach) {
        hooks.unshift(...curr.beforeEach);
      }
      curr = curr.parent;
    }
    return hooks;
  }

  async function runSuite(suite, depth = 0) {
    const indent = '  '.repeat(Math.max(depth - 1, 0));
    if (suite.name && suite.name !== '(root)' && suite.tests.length) {
      reporter.log(`${indent}${suite.name}`);
    }
    for (const child of suite.children) {
      await runSuite(child, depth + 1);
    }

    const hooks = collectHooks(suite);

    for (const test of suite.tests) {
      try {
        for (const hook of hooks) {
            await hook();
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
