/** Drain edits through one writer. Concurrent callers share both the active
 * write and any follow-up needed for edits made while that write was pending. */
export function createSaveQueue(pending: () => boolean, write: () => Promise<boolean>) {
  let inFlight: Promise<void> | null = null;
  return {
    flush(): Promise<void> {
      if (inFlight) return inFlight;
      const operation = Promise.resolve().then(async () => {
        while (pending()) {
          // A failed write stays dirty for an explicit retry. Never turn an
          // unavailable endpoint into an unbounded background retry loop.
          if (!(await write())) break;
        }
      });
      const shared = operation.finally(() => {
        if (inFlight === shared) inFlight = null;
      });
      inFlight = shared;
      return shared;
    }
  };
}
