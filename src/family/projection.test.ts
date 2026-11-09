import { describe, it, expect } from "vitest";
import { blankSnapshot, type Operation } from "./types";
import { applyOptimistic, legacyProjection } from "./projection";
import "fake-indexeddb/auto";
import {
  putOperation,
  listOperations,
  removeOperation,
  cacheSnapshot,
  cachedSnapshot,
  forgetUserCache,
} from "./cache";
import { saveEntry, readRecords } from "../db";
import { emptyEntry } from "../model";
const op = (kind: string, payload: Record<string, unknown>): Operation => ({
  id: crypto.randomUUID(),
  userId: "anton-id",
  familyId: "family-id",
  kind,
  target: "iron-man",
  payload,
  expected: 0,
  createdAt: new Date().toISOString(),
  state: "queued",
});
describe("family records and durable outbox", () => {
  it("projects ratings only to their verified member role", () => {
    let s = blankSnapshot();
    s.members = [
      {
        user_id: "anton-id",
        family_id: "family-id",
        role: "anton",
        joined_at: "",
      },
      {
        user_id: "tanya-id",
        family_id: "family-id",
        role: "tanya",
        joined_at: "",
      },
    ];
    s = applyOptimistic(
      s,
      op("rating", { score: 9, favorite: true, season: 0 }),
    );
    expect(legacyProjection(s, "anton-id")["iron-man"].anton).toBe(9);
    expect(legacyProjection(s, "anton-id")["iron-man"].tanya).toBeNull();
    expect(legacyProjection(s, "tanya-id")["iron-man"].favorite).toBe(false);
  });
  it("keeps per-season ratings separate from the whole-series rating", () => {
    const s = applyOptimistic(
      blankSnapshot(),
      op("rating", { score: 10, season: 1 }),
    );
    expect(s.ratings[0].season).toBe(1);
    expect(legacyProjection(s, "anton-id")["iron-man"]).toBeUndefined();
  });
  it("keeps personal cache isolated and original IndexedDB intact", async () => {
    await saveEntry("iron-man", { ...emptyEntry(), note: "Original v1" });
    await cacheSnapshot("anton-id", blankSnapshot());
    await cacheSnapshot("tanya-id", blankSnapshot());
    const operation = op("entry", { watched: true });
    await putOperation(operation);
    expect(await listOperations("anton-id")).toHaveLength(1);
    expect(await listOperations("tanya-id")).toHaveLength(0);
    await forgetUserCache("anton-id");
    expect(await cachedSnapshot("anton-id")).toBeUndefined();
    expect(await cachedSnapshot("tanya-id")).toBeDefined();
    expect((await readRecords())["iron-man"].note).toBe("Original v1");
  });
  it("stores idempotency keys across reloads and removes acknowledged operations", async () => {
    const o = op("message", { body: "Offline draft", scope: "chat" });
    await putOperation(o);
    await putOperation(o);
    expect(
      (await listOperations(o.userId)).filter((x) => x.id === o.id),
    ).toHaveLength(1);
    await removeOperation(o.id);
    expect(
      (await listOperations(o.userId)).filter((x) => x.id === o.id),
    ).toHaveLength(0);
  });
});
