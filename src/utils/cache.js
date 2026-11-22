/**
 * Lightweight in-memory TTL cache with bounded size and LRU-style eviction.
 * Zero external dependencies.
 */

/**
 * In-memory bounded TTL + LRU cache.
 */
export class TtlCache {
  constructor({ ttlMs = 10 * 60 * 1000, maxEntries = 200 } = {}) {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new RangeError('ttlMs must be a positive finite number');
    }
    if (!Number.isInteger(maxEntries) || maxEntries < 1) {
      throw new RangeError('maxEntries must be an integer >= 1');
    }
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.store = new Map();
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    // Refresh recency order on read
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key, value, customTtlMs) {
    const effectiveTtl =
      typeof customTtlMs === 'number' && customTtlMs > 0 ? customTtlMs : this.ttlMs;

    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxEntries) {
      this.pruneExpired();
      if (this.store.size >= this.maxEntries) {
        const oldestKey = this.store.keys().next().value;
        this.store.delete(oldestKey);
      }
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + effectiveTtl,
    });
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  delete(key) {
    return this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }

  pruneExpired() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now >= entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }

  get size() {
    this.pruneExpired();
    return this.store.size;
  }
}
