/**
 * Tiny synchronous pub/sub used by every system to communicate without hard
 * dependencies. Event names live in `EVENTS` (src/core/constants.js).
 */
export class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this.listeners = new Map();
  }

  /** Subscribe. Returns an unsubscribe function. */
  on(name, fn) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(fn);
    return () => this.off(name, fn);
  }

  once(name, fn) {
    const off = this.on(name, (payload) => {
      off();
      fn(payload);
    });
    return off;
  }

  off(name, fn) {
    this.listeners.get(name)?.delete(fn);
  }

  emit(name, payload = {}) {
    const set = this.listeners.get(name);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[EventBus] listener for "${name}" threw`, err);
      }
    }
  }

  clear() {
    this.listeners.clear();
  }
}

/** Shared singleton bus. Systems may also receive a bus via constructor. */
export const bus = new EventBus();
