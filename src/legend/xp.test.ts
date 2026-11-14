import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  xpScale,
  trophyXP,
  rebaseCachedAwards,
  ownerXP,
  trophyNotificationTitle,
} from "./xp";
import { level, registry } from "./model";
it("uses bronze 10, silver 25, gold 50 and platinum 100 for every definition", () => {
  expect(xpScale).toEqual({ bronze: 10, silver: 25, gold: 50, platinum: 100 });
  expect(registry).toHaveLength(82);
  expect(registry.reduce((n, a) => n + trophyXP(a.displayTier), 0)).toBe(3155);
  expect(trophyXP("bronze")).toBe(10);
  expect(trophyXP("silver")).toBe(25);
  expect(trophyXP("gold")).toBe(50);
  expect(trophyXP("platinum")).toBe(100);
  expect(() => trophyXP("rare")).toThrow();
  const sql = readFileSync(
    "supabase/migrations/20261114113248_fair_xp.sql",
    "utf8",
  );
  for (const [tier, xp] of Object.entries(xpScale))
    expect(sql).toContain(`values('${tier}',${xp})`);
});
it("repairs a previous offline cache without changing metadata, IDs, ownership or notification receipts", () => {
  const before = [
    {
      achievement_id: "films-1",
      owner: "family",
      xp: 25,
      unlocked_at: "2025-01-01",
      historical: true,
    },
    {
      achievement_id: "phase-1-v1",
      owner: "family",
      xp: 100,
      unlocked_at: "2025-02-01",
      historical: false,
    },
    {
      achievement_id: "anton-perfect1",
      owner: "anton",
      xp: 25,
      unlocked_at: "2025-03-01",
      historical: false,
    },
    {
      achievement_id: "tanya-ratings-1",
      owner: "tanya",
      xp: 10,
      unlocked_at: "2025-04-01",
      historical: true,
    },
  ];
  const after = rebaseCachedAwards(before);
  expect(after.map((a) => a.xp)).toEqual([10, 50, 10, 10]);
  expect(after.map(({ xp, ...meta }) => meta)).toEqual(
    before.map(({ xp, ...meta }) => meta),
  );
  expect(before[0].xp).toBe(25);
  expect(rebaseCachedAwards(after)).toEqual(after);
  expect(ownerXP(after)).toEqual({ family: 60, anton: 10, tanya: 10 });
});
it("keeps existing level thresholds and owner partitions when XP decreases", () => {
  expect([0, 100, 250, 450, 700].map((x) => level(x).level)).toEqual([
    1, 2, 3, 4, 5,
  ]);
  expect(level(485).level).toBe(4);
  expect(level(175)).toEqual({ level: 2, current: 75, total: 150 });
  expect(
    ownerXP([
      { owner: "family", xp: 50 },
      { owner: "family", xp: 25 },
      { owner: "anton", xp: 10 },
      { owner: "tanya", xp: 100 },
    ]),
  ).toEqual({ family: 75, anton: 10, tanya: 100 });
});
it("repairs cached trophy notification text without altering unrelated notifications or IDs", () => {
  const n = {
    id: "stable-id",
    type: "achievement",
    route: "/legend/films-1",
    title: "Семья · БРОНЗА · +25 XP",
    read_at: null,
  };
  expect(trophyNotificationTitle(n)).toBe("Семья · БРОНЗА · +10 XP");
  expect(n.title).toContain("+25 XP");
  expect(trophyNotificationTitle({ ...n, type: "rating" })).toBe(n.title);
});
