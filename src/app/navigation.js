// Mock for $app/navigation - used in tests
export function goto(url, opts) {
  console.log(`[Mock navigation] goto: ${url}`);
  return Promise.resolve();
}

export function invalidate(url) {
  return Promise.resolve();
}

export function invalidateAll() {
  return Promise.resolve();
}

export function preloadData(url) {
  return Promise.resolve({});
}

export function preloadCode(...urls) {
  return Promise.resolve();
}

export function beforeNavigate(callback) {
  // No-op in tests
}

export function afterNavigate(callback) {
  // No-op in tests
}
