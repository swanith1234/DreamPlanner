/**
 * Native in-memory caching utility with TTL logic.
 * Designed to absorb high-frequency duplicate requests.
 */

type CacheValue<T> = {
  data: T;
  expiry: number;
};

export class MemoryCache {
  private cache: Map<string, CacheValue<any>>;
  private defaultTTL: number;

  constructor(defaultTTLSeconds: number = 120) {
    this.cache = new Map();
    this.defaultTTL = defaultTTLSeconds * 1000;
  }

  set<T>(key: string, data: T, ttlSeconds?: number): void {
    const ttl = (ttlSeconds !== undefined ? ttlSeconds : this.defaultTTL / 1000) * 1000;
    const expiry = Date.now() + ttl;
    this.cache.set(key, { data, expiry });
  }

  get<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    if (Date.now() > cached.expiry) {
      this.cache.delete(key);
      return null;
    }

    return cached.data as T;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  deleteByPrefix(prefix: string): void {
    const delimiterPrefix = prefix.endsWith(':') ? prefix : `${prefix}:`;
    for (const key of this.cache.keys()) {
      if (key === prefix || key.startsWith(delimiterPrefix)) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }

  /**
   * Helper to generate a unique cache key based on user ID and query parameters.
   */
  static generateKey(prefix: string, userId: string, params: object = {}): string {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}:${(params as any)[key]}`)
      .join('|');
    return `${prefix}:${userId}${sortedParams ? `:${sortedParams}` : ''}`;
  }
}

export const globalCache = new MemoryCache(120); // Default 120s TTL
