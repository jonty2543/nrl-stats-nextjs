type CacheEntry = { promise: Promise<unknown>; expiresAt: number };

const MAX_ENTRIES = 32;
const entries = new Map<string, CacheEntry>();

// Public sports data only: never cache auth, user metadata or personalised data.
// Keep local navigation fast without depending on Next's persistent cache size limit.
export function cacheDevelopmentQuery<T>(
  key: string,
  load: () => Promise<T>,
  ttlMs = 60_000,
): Promise<T> {
  if (process.env.NODE_ENV !== "development") return load();

  const now = Date.now();
  for (const [entryKey, entry] of entries) {
    if (entry.expiresAt <= now) entries.delete(entryKey);
  }
  const existing = entries.get(key);
  if (existing) return existing.promise as Promise<T>;

  if (entries.size >= MAX_ENTRIES) entries.delete(entries.keys().next().value!);
  const entry: CacheEntry = { promise: Promise.resolve(), expiresAt: Infinity };
  entry.promise = Promise.resolve().then(load).then(
    (value) => {
      entry.expiresAt = Date.now() + ttlMs;
      return value;
    },
    (error) => {
      if (entries.get(key) === entry) entries.delete(key);
      throw error;
    },
  );
  entries.set(key, entry);
  return entry.promise as Promise<T>;
}
