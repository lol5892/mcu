import {retiredCommunication} from "./outbox";
import { it, expect } from "vitest";
import type { Operation } from "./types";
import { outboxLane, nextSendable } from "./outbox";
const op = (
  kind: string,
  target: string,
  payload: Record<string, unknown> = {},
  state: Operation["state"] = "queued",
): Operation => ({
  id: kind + target,
  userId: "anton",
  familyId: "family",
  kind,
  target,
  payload,
  state,
  expected: 1,
  createdAt: "",
});
it("a blocked personal rating does not freeze another project or watch confirmation", () => {
  const blocked = op("rating", "iron-man", { season: 0, score: 9 }, "conflict");
  const next = op("watch_confirm", "request-id");
  expect(nextSendable([blocked, next])).toBe(next);
});
it("the same conflicted personal season remains blocked without overwriting it", () => {
  const blocked = op("rating", "iron-man", { season: 1 }, "conflict");
  expect(
    nextSendable([blocked, op("rating", "iron-man", { season: 1, score: 10 })]),
  ).toBeUndefined();
  expect(outboxLane(blocked)).not.toBe(
    outboxLane(op("rating", "iron-man", { season: 2, score: 10 })),
  );
});
it("watch-only changes are independent of a conflicting shared note", () => {
  const note = op("entry", "iron-man", { note: "text" }, "conflict");
  const watch = op("entry", "iron-man", { watched: true, watched_date: null });
  expect(nextSendable([note, watch])).toBe(watch);
});

it("classifies archived communication without disabling important watch and rating operations",()=>{expect(retiredCommunication({kind:"letter",payload:{status:"delivered"}})).toBe(true);expect(retiredCommunication({kind:"message",payload:{}})).toBe(true);expect(retiredCommunication({kind:"rating",payload:{score:9}})).toBe(false);expect(retiredCommunication({kind:"watch_confirm",payload:{}})).toBe(false);});
