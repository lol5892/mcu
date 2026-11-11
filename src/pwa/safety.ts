/** In-memory guards only: never touch auth, push subscriptions or durable queues. */
const blockers = new Set<string>();
let sequence = 0;
export function setUpdateBlocker(key: string, blocked: boolean) {
  if (blocked) blockers.add(key);
  else blockers.delete(key);
  window.dispatchEvent(new Event("mv-update-safety"));
}
export function acquireUpdateBlocker(reason: string) {
  const key = `${reason}:${++sequence}`;
  setUpdateBlocker(key, true);
  return () => setUpdateBlocker(key, false);
}
export function updateBlocked() { return blockers.size > 0; }
