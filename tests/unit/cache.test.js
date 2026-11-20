import { jest } from '@jest/globals';
import { TtlCache } from '../../src/utils/cache.js';

describe('TtlCache utility', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-19T10:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('stores and retrieves values before TTL expires', () => {
    const cache = new TtlCache({ ttlMs: 5000, maxEntries: 10 });
    cache.set('delhi', { pm25: 180 });
    expect(cache.has('delhi')).toBe(true);
    expect(cache.get('delhi')).toEqual({ pm25: 180 });

    jest.advanceTimersByTime(4999);
    expect(cache.get('delhi')).toEqual({ pm25: 180 });
  });

  test('expires entries once TTL elapses', () => {
    const cache = new TtlCache({ ttlMs: 5000, maxEntries: 10 });
    cache.set('mathura', { pm25: 168 });

    jest.advanceTimersByTime(5000);
    expect(cache.get('mathura')).toBeUndefined();
    expect(cache.has('mathura')).toBe(false);
    expect(cache.size).toBe(0);
  });

  test('evicts least-recently-used entry when maxEntries is reached', () => {
    const cache = new TtlCache({ ttlMs: 60000, maxEntries: 2 });
    cache.set('a', 1);
    cache.set('b', 2);
    // Access 'a' so 'b' becomes oldest
    expect(cache.get('a')).toBe(1);
    cache.set('c', 3);

    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
  });

  test('supports delete and clear', () => {
    const cache = new TtlCache({ ttlMs: 60000, maxEntries: 5 });
    cache.set('x', 10);
    cache.set('y', 20);
    expect(cache.delete('x')).toBe(true);
    expect(cache.get('x')).toBeUndefined();
    cache.clear();
    expect(cache.size).toBe(0);
  });

  test('validates constructor arguments', () => {
    expect(() => new TtlCache({ ttlMs: 0 })).toThrow(RangeError);
    expect(() => new TtlCache({ maxEntries: 0 })).toThrow(RangeError);
  });
});
