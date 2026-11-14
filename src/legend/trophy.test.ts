import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import registry from "./registry.json";
import original from "../../docs/v2.5.1/art-direction.json";
import { legacyXP, routeAward, tierLabels, parseNoticeSeen } from "./trophy";
it("has 82 unique individual descriptions and precise separate conditions", () => {
  expect(registry).toHaveLength(82);
  expect(new Set(registry.map((a) => a.description)).size).toBe(82);
  for (const a of registry) {
    expect(a.description.length).toBeGreaterThan(60);
    expect(a.howTo.length).toBeGreaterThan(25);
    expect(Object.keys(tierLabels)).toContain(a.displayTier);
    const before = original.find((x) => x.id === a.id)!;
    for (const field of [
      "id",
      "title",
      "projects",
      "metric",
      "threshold",
      "owner",
      "rarity",
      "category",
    ] as const)
      expect(a[field]).toEqual(before[field]);
    if (a.owner === "anton") expect(a.description).toContain("Антон");
    if (a.owner === "tanya") expect(a.description).toContain("Тан");
    expect(legacyXP(a.rarity)).toBe(legacyXP(before.rarity));
  }
});
it("keeps platinum exceptional and synchronizes server display metadata", () => {
  const count = (t: string) =>
    registry.filter((a) => a.displayTier === t).length;
  expect([
    count("bronze"),
    count("silver"),
    count("gold"),
    count("platinum"),
  ]).toEqual([18, 27, 28, 9]);
  const sql = readFileSync(
    "supabase/migrations/20261114095901_trophy_system.sql",
    "utf8",
  );
  for (const a of registry)
    expect(sql).toContain(`'${a.id}','${a.title}','${a.displayTier}'`);
  expect(
    registry
      .filter((a) => a.id.startsWith("phase-"))
      .every((a) => a.displayTier !== "platinum"),
  ).toBe(true);
});
it("only opens existing award IDs from notification routes", () => {
  const ids = registry.map((a) => a.id);
  expect(routeAward("#/legend/phase-1-v1", ids)).toBe("phase-1-v1");
  expect(routeAward("#/legend/stats", ids)).toBeNull();
  expect(routeAward("#/legend/<script>", ids)).toBeNull();
});

it("recovers a malformed local notice receipt without changing awards", () => {
  expect(parseNoticeSeen("broken")).toEqual([]);
  expect(parseNoticeSeen('{"fake":1}')).toEqual([]);
  expect(parseNoticeSeen('["films-1","films-1",null]')).toEqual(["films-1"]);
});
