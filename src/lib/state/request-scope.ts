/** Coalesces concurrent reads and invalidates their results when an owner is reset. */
export class RequestScope {
  private generation = 0;
  private pending = new Map<string, { controller: AbortController; promise: Promise<void> }>();

  get size() { return this.pending.size; }

  run(key: string, operation: (context: { signal: AbortSignal; isCurrent: () => boolean }) => Promise<void>): Promise<void> {
    const existing = this.pending.get(key);
    if (existing) return existing.promise;
    const generation = this.generation;
    const controller = new AbortController();
    const isCurrent = () => generation === this.generation && !controller.signal.aborted;
    const promise = Promise.resolve()
      .then(() => { if (isCurrent()) return operation({ signal: controller.signal, isCurrent }); })
      .finally(() => {
        if (this.pending.get(key)?.controller === controller) this.pending.delete(key);
      });
    this.pending.set(key, { controller, promise });
    return promise;
  }

  reset() {
    this.generation++;
    for (const request of this.pending.values()) request.controller.abort();
    this.pending.clear();
  }
}
