import { openDB } from "idb";
import { blankSnapshot, type Snapshot, type Operation } from "./types";
// A separate database: no upgrade or deletion of the original our-marvel store.
const db = openDB("our-marvel-family", 1, {
  upgrade(d) {
    d.createObjectStore("snapshots");
    d.createObjectStore("outbox", { keyPath: "id" });
  },
});
export async function cacheSnapshot(user: string, data: Snapshot) {
  await (await db).put("snapshots", data, user);
}
export async function cachedSnapshot(
  user: string,
): Promise<Snapshot | undefined> {
  const value = await (await db).get("snapshots", user);
  return value ? { ...blankSnapshot(), ...value } : undefined;
}
export async function putOperation(op: Operation) {
  await (await db).put("outbox", op);
}
export async function removeOperation(id: string) {
  await (await db).delete("outbox", id);
}
export async function listOperations(user: string): Promise<Operation[]> {
  const rows: Operation[] = await (await db).getAll("outbox");
  return rows
    .filter((o) => o.userId === user)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export async function forgetUserCache(user: string) {
  const d = await db;
  const tx = d.transaction(["snapshots", "outbox"], "readwrite");
  await tx.objectStore("snapshots").delete(user);
  const rows: Operation[] = await tx.objectStore("outbox").getAll();
  for (const op of rows)
    if (op.userId === user) await tx.objectStore("outbox").delete(op.id);
  await tx.done;
}
