import { it, expect } from "vitest";
import { blankSnapshot, type Operation } from "./types";
import { applyOptimistic } from "./projection";
import { supersededWatch } from "./reconcile";
const op: Operation = {
  id: "op",
  userId: "anton",
  familyId: "family",
  kind: "entry",
  target: "iron-man-2",
  payload: { watched: true, watched_date: "2026-11-09" },
  expected: 0,
  createdAt: "",
  state: "conflict",
};
it("an optimistic watch request is visible without prematurely completing the movie", () => {
  const s = blankSnapshot();
  s.family = { id: "family", watch_confirmation: true };
  const next = applyOptimistic(s, op);
  expect(next.entries[0].watched).toBe(false);
  expect(next.watchRequests[0].status).toBe("pending");
  expect(next.watchRequests[0].version).toBe(0);
});
it("an explicit corrected epoch removes only obsolete watch intent, not a fresh mark or an unsaved note", () => {
  const s = blankSnapshot();
  s.family = { id: "family", watch_confirmation: true };
  s.watchRequests = [
    {
      id: "request",
      family_id: "family",
      project_id: "iron-man-2",
      season: 0,
      episode: 0,
      requested_by: "anton",
      confirmed_by: null,
      status: "cancelled",
      proposed_date: null,
      requested_at: "",
      responded_at: "",
      base_version: 1,
      version: 1,
    },
  ];
  expect(supersededWatch(s, op)).toBe(true);
  expect(supersededWatch(s, { ...op, expected: 1 })).toBe(false);
  expect(
    supersededWatch(s, { ...op, payload: { ...op.payload, note: "unsaved" } }),
  ).toBe(false);
});

it("a new offline mark after correction is kept even with an older cached version", () => {
  const s = blankSnapshot();
  s.family = { id: "family", watch_confirmation: true };
  s.watchRequests = [
    {
      id: "request",
      family_id: "family",
      project_id: "iron-man-2",
      season: 0,
      episode: 0,
      requested_by: "anton",
      confirmed_by: null,
      status: "cancelled",
      proposed_date: null,
      requested_at: "2026-11-09T10:00:00Z",
      responded_at: "2026-11-09T10:00:00Z",
      base_version: 1,
      version: 1,
    },
  ];
  expect(
    supersededWatch(s, {
      ...op,
      payload: { ...op.payload, intent_at: "2026-11-09T11:00:00Z" },
    }),
  ).toBe(false);
});
