import { describe, it, expect } from "vitest";
import { registry, evaluate, level } from "./model";
import { catalog, emptyEntry } from "../model";
describe("versioned legend", () => {
  it("matches all 82 definitions to real catalog and valid thresholds", () => {
    expect(registry).toHaveLength(82);
    for (const a of registry) {
      expect(a.threshold).toBeGreaterThan(0);
      for (const id of a.projects)
        expect(catalog.some((p) => p.id === id)).toBe(true);
    }
  });
  it("completes phase 3 and hero trilogy from distinct watched films, not ratings", () => {
    const ids = registry.find((a) => a.id === "phase-3-v1")!.projects;
    expect(ids).toHaveLength(11);
    const state = Object.fromEntries(
      ids.map((id) => [id, { ...emptyEntry(), watched: true }]),
    );
    expect(
      evaluate(state, "2026-11-13").find((a) => a.id === "phase-3-v1")!
        .qualified,
    ).toBe(true);
    expect(
      evaluate(
        { "iron-man": { ...emptyEntry(), anton: 10 } },
        "2026-11-13",
      ).find((a) => a.id === "films-1")!.qualified,
    ).toBe(false);
  });
  it("requires actual episodes for completed series and counts seasons once", () => {
    const loki = catalog.find((p) => p.id === "loki")!;
    const episodes = loki.seasons.flatMap((s) =>
      Array.from({ length: s.episodes }, (_, i) => s.number + ":" + (i + 1)),
    );
    const state = { loki: { ...emptyEntry(), episodes } };
    expect(
      evaluate(state, "2026-11-13").find((a) => a.id === "serial-loki")!
        .qualified,
    ).toBe(true);
    expect(
      evaluate(
        { ...state, loki: { ...state.loki, episodes: episodes.slice(1) } },
        "2026-11-13",
      ).find((a) => a.id === "serial-loki")!.qualified,
    ).toBe(false);
  });

  it("uses unique stable achievement identifiers", () =>
    expect(new Set(registry.map((a) => a.id)).size).toBe(registry.length));
  it("counts a family film once and keeps personal scores separate", () => {
    const state = evaluate(
      { "iron-man": { ...emptyEntry(), watched: true, anton: 10 } },
      "2026-11-13",
    );
    expect(state.find((a) => a.id === "films-1")?.qualified).toBe(true);
    expect(state.find((a) => a.id === "anton-perfect1")?.qualified).toBe(true);
    expect(state.find((a) => a.id === "tanya-perfect1")?.qualified).toBe(false);
  });
  it("requires all six phase one films and blocks unreleased phase six", () => {
    const ids = registry.find((a) => a.id === "phase-1-v1")!.projects;
    const r = Object.fromEntries(
      ids.map((id) => [id, { ...emptyEntry(), watched: true }]),
    );
    expect(
      evaluate(r, "2026-11-13").find((a) => a.id === "phase-1-v1")?.qualified,
    ).toBe(true);
    expect(
      evaluate(r, "2026-11-13").find((a) => a.id === "phase-6-v1")?.qualified,
    ).toBe(false);
  });
  it("has predictable level thresholds", () => {
    expect([0, 100, 250, 450, 700].map((x) => level(x).level)).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });
});
