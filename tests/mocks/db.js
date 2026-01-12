// tests/mocks/db.js
let queryImplementation = () => {
  throw new Error('db.query mock not implemented');
};

let transactionImplementation = () => {
    throw new Error('db.transaction mock not implemented');
}

export function query(...args) {
  return queryImplementation(...args);
}

export function transaction(...args) {
    return transactionImplementation(...args);
}

export function __setQueryMock(impl) {
  queryImplementation = impl;
}

export function __setTransactionMock(impl) {
    transactionImplementation = impl;
}
