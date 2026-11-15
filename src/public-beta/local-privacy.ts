const accountPrefixes = [
  "mv-legend:",
  "mv-trophy-seen:",
  "mv-impressions:",
  "mv-impression-draft:",
  "mv-draft-v1:",
];
export function accountCacheKeys(storage: Storage, userId: string) {
  return Array.from({ length: storage.length }, (_, i) =>
    storage.key(i),
  ).filter((key): key is string =>
    Boolean(
      key &&
      accountPrefixes.some((p) => key.startsWith(p)) &&
      key.split(":").includes(userId),
    ),
  );
}
export function clearAccountCache(storage: Storage, userId: string) {
  for (const key of accountCacheKeys(storage, userId)) storage.removeItem(key);
}
