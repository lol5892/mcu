import { it, expect } from "vitest";
import { blankSnapshot, type Operation } from "./types";
import { operationSatisfied } from "./reconcile";
const op = (kind: string, payload: Record<string, unknown>): Operation => ({
  id: "op",
  kind,
  target: "iron-man",
  userId: "anton",
  familyId: "family",
  payload,
  expected: 1,
  createdAt: "2026-11-09T00:00:00Z",
  state: "conflict",
});
function snapshot() {
  const s = blankSnapshot();
  s.entries = [
    {
      family_id: "family",
      project_id: "iron-man",
      watched: true,
      watched_date: null,
      note: "Partner note",
      version: 4,
      updated_by: "tanya",
      updated_at: "",
    },
  ];
  s.ratings = [
    {
      family_id: "family",
      project_id: "iron-man",
      user_id: "anton",
      season: 0,
      score: 6,
      favorite: false,
      version: 2,
      updated_at: "",
    },
    {
      family_id: "family",
      project_id: "iron-man",
      user_id: "tanya",
      season: 0,
      score: 10,
      favorite: false,
      version: 1,
      updated_at: "",
    },
  ];
  return s;
}
it("acknowledges the same shared mark without changing a partner note", () => {
  const s = snapshot();
  expect(operationSatisfied(s, op("entry", { watched: true }))).toBe(true);
  expect(s.entries[0].note).toBe("Partner note");
});
it("preserves a differing intended note even when the watched mark matches", () => {
  expect(
    operationSatisfied(
      snapshot(),
      op("entry", { watched: true, note: "My different note" }),
    ),
  ).toBe(false);
});
it("a matching partner score cannot acknowledge the current user rating", () => {
  expect(
    operationSatisfied(snapshot(), op("rating", { season: 0, score: 10 })),
  ).toBe(false);
});
it("only the exact own season score and favorite can acknowledge a rating", () => {
  const s = snapshot();
  expect(
    operationSatisfied(
      s,
      op("rating", { season: 0, score: 6, favorite: false }),
    ),
  ).toBe(true);
  expect(operationSatisfied(s, op("rating", { season: 1, score: 6 }))).toBe(
    false,
  );
  expect(
    operationSatisfied(s, op("rating", { score: 6, favorite: true })),
  ).toBe(false);
});
it("episode identity includes family, season and episode", () => {
  const s = snapshot();
  s.episodes = [
    {
      family_id: "family",
      project_id: "iron-man",
      season: 1,
      episode: 2,
      watched: true,
      version: 1,
      updated_by: "anton",
    },
  ];
  expect(
    operationSatisfied(
      s,
      op("episode", { season: 1, episode: 2, watched: true }),
    ),
  ).toBe(true);
  expect(
    operationSatisfied(
      s,
      op("episode", { season: 2, episode: 2, watched: true }),
    ),
  ).toBe(false);
});
it("unknown fields, empty patches and unsupported kinds are never inferred successful", () => {
  const s = snapshot();
  expect(
    operationSatisfied(s, op("entry", { watched: true, user_id: "tanya" })),
  ).toBe(false);
  expect(operationSatisfied(s, op("entry", {}))).toBe(false);
  expect(operationSatisfied(s, op("letter", { status: "delivered" }))).toBe(
    false,
  );
  expect(
    operationSatisfied(s, {
      ...op("entry", { watched: true }),
      familyId: "other-family",
    }),
  ).toBe(false);
});
