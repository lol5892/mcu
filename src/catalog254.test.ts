import { describe, it, expect, vi, afterEach } from "vitest";
import {
  catalog,
  emptyEntry,
  markAll,
  selectWatchItems,
  nextRecommendation,
  watched,
  itemProgress,
  type Records,
} from "./model";
import {
  defaultFilters,
  updateFilters,
  normalizeFilters,
  loadFilters,
  saveFilters,
  FILTER_STORAGE_KEY,
} from "./catalog-preferences";

const filmFilters = () => ({ ...defaultFilters(), type: "film" });
const film = catalog.find((p) => p.id === "iron-man")!;
const loki = catalog.find((p) => p.id === "loki")!;
const mainFilms = catalog
  .filter((p) => p.section === "main" && p.type === "film")
  .sort((a, b) => a.date.localeCompare(b.date));
afterEach(() => vi.unstubAllGlobals());

describe("smart viewing queue 2.5.4", () => {
  it("hides and restores watched movies without touching any data or positions", () => {
    const records = Object.fromEntries(
      mainFilms
        .slice(0, 8)
        .map((p) => [
          p.id,
          {
            ...markAll(p, emptyEntry(), true),
            anton: 9,
            tanya: 7,
            note: "Наше воспоминание",
          },
        ]),
    );
    const before = JSON.stringify(records);
    const all = selectWatchItems(records, filmFilters());
    const hidden = selectWatchItems(records, {
      ...filmFilters(),
      hideWatched: true,
    });
    expect(hidden[0].project.id).toBe("winter-soldier");
    expect(hidden[0].position).toBe(9);
    expect(hidden.slice(0, 12)).toHaveLength(12);
    expect(
      all
        .filter((i) => !hidden.some((h) => h.key === i.key))
        .map((i) => i.project.id),
    ).toEqual(mainFilms.slice(0, 8).map((p) => p.id));
    expect(selectWatchItems(records, filmFilters())).toEqual(all);
    expect(JSON.stringify(records)).toBe(before);
  });
  it("a pending or rejected watch stays until the confirmed projection changes", () => {
    const f = { ...filmFilters(), hideWatched: true };
    const records = { [film.id]: { ...emptyEntry(), anton: 9, tanya: 8 } };
    expect(
      selectWatchItems(records, f).some((i) => i.project.id === film.id),
    ).toBe(true);
    records[film.id] = { ...records[film.id], watched: true };
    expect(
      selectWatchItems(records, f).some((i) => i.project.id === film.id),
    ).toBe(false);
    expect(records[film.id].anton).toBe(9);
  });
  it("shows the unfinished season and exact episode progress, hides completed seasons", () => {
    const r = {
      loki: {
        ...emptyEntry(),
        episodes: [
          ...Array.from({ length: 6 }, (_, i) => `1:${i + 1}`),
          "2:1",
          "2:2",
          "2:3",
        ],
      },
    };
    const f = {
      ...defaultFilters(),
      type: "series",
      hideWatched: true,
      query: "Локи",
    };
    const items = selectWatchItems(r, f);
    expect(items.map((i) => i.season?.number)).toEqual([2]);
    expect(itemProgress(items[0], r.loki)).toEqual({ done: 3, total: 6 });
    expect(watched(loki, r.loki)).toBe(false);
    r.loki = markAll(loki, r.loki, true);
    expect(selectWatchItems(r, f)).toHaveLength(0);
  });
  it("interleaves Loki seasons and movies by their real release dates", () => {
    const f = { ...defaultFilters(), type: "film-series" };
    const items = selectWatchItems({}, f);
    const first = items.findIndex((i) => i.key === "loki:season:1"),
      second = items.findIndex((i) => i.key === "loki:season:2");
    const widow = items.findIndex((i) => i.project.id === "widow");
    expect(first).toBeLessThan(widow);
    expect(widow).toBeLessThan(second);
    expect(items[second].date).toBe("2023-10-05");
    expect(items.every((i) => i.project.type !== "special")).toBe(true);
    expect(
      items.every((item, i) => i === 0 || item.date >= items[i - 1].date),
    ).toBe(true);
  });
  it("handles the seven SHIELD seasons as distinct releases without changing IDs", () => {
    const items = selectWatchItems(
      {},
      { ...defaultFilters(), section: "related" },
    ).filter((i) => i.project.id === "shield");
    expect(items).toHaveLength(7);
    expect(new Set(items.map((i) => i.key)).size).toBe(7);
    expect(new Set(items.map((i) => i.project.id))).toEqual(
      new Set(["shield"]),
    );
    expect(items.map((i) => i.date)).toEqual(
      catalog.find((p) => p.id === "shield")!.seasons.map((s) => s.date),
    );
  });
  it("supports films, films/series, specials and series in each universe", () => {
    for (const section of ["main", "all"] as const) {
      for (const type of ["film", "film-series", "series", "special", "all"]) {
        const items = selectWatchItems(
          {},
          { ...defaultFilters(), section, type },
        );
        expect(items.length).toBeGreaterThan(0);
        expect(
          items.every((i) => section === "all" || i.project.section === "main"),
        ).toBe(true);
        expect(
          items.every(
            (i) =>
              type === "all" ||
              (type === "film-series"
                ? i.project.type !== "special"
                : i.project.type === type),
          ),
        ).toBe(true);
      }
    }
    const all = selectWatchItems({}, { ...defaultFilters(), section: "all" });
    expect(new Set(all.map((i) => i.project.section))).toEqual(
      new Set(["main", "defenders", "related", "animation"]),
    );
  });
  it("keeps future projects in their own view and excludes unreleased seasons/episodes", () => {
    const f = { ...defaultFilters(), section: "all" as const };
    const items = selectWatchItems({}, f, "2023-01-01");
    expect(items.some((i) => i.key === "loki:season:1")).toBe(true);
    expect(items.some((i) => i.key === "loki:season:2")).toBe(false);
    expect(
      items.every(
        (i) => i.project.section !== "future" && i.date <= "2023-01-01",
      ),
    ).toBe(true);
    expect(
      selectWatchItems({}, { ...f, section: "future" }).map(
        (i) => i.project.id,
      ),
    ).toEqual(expect.arrayContaining(["doomsday", "secret-wars"]));
    expect(nextRecommendation({}, { ...f, section: "future" })).toBeUndefined();
    const allDone = Object.fromEntries(
      catalog
        .filter((p) => p.id !== "visionquest")
        .map((p) => [p.id, markAll(p, emptyEntry(), true)]),
    );
    const v = catalog.find((p) => p.id === "visionquest")!;
    allDone.visionquest = {
      ...emptyEntry(),
      episodes: v.seasons.flatMap((s) =>
        Array.from({ length: 7 }, (_, i) => `${s.number}:${i + 1}`),
      ),
    };
    expect(nextRecommendation(allDone, f, "2026-11-08")).toBeUndefined();
    expect(nextRecommendation(allDone, f, "2026-11-10")?.project.id).toBe(
      "visionquest",
    );
  });
  it("recommends by selected composition and skips complete or unavailable projects", () => {
    const r: Records = Object.fromEntries(
      catalog
        .filter(
          (p) =>
            p.section === "main" && p.date < "2021-07-09" && p.id !== "loki",
        )
        .map((p) => [p.id, markAll(p, emptyEntry(), true)]),
    );
    r.loki = {
      ...emptyEntry(),
      episodes: Array.from({ length: 6 }, (_, i) => `1:${i + 1}`),
    };
    expect(
      nextRecommendation(r, { ...defaultFilters(), type: "film-series" })
        ?.project.id,
    ).toBe("widow");
    expect(nextRecommendation(r, filmFilters())?.project.type).toBe("film");
    const allDone = Object.fromEntries(
      catalog.map((p) => [p.id, markAll(p, emptyEntry(), true)]),
    );
    expect(
      nextRecommendation(allDone, {
        ...defaultFilters(),
        section: "all",
        hideWatched: true,
      }),
    ).toBeUndefined();
  });
  it("preserves grouped chronology and warns about projects with unknown placement", () => {
    const items = selectWatchItems(
      {},
      { ...defaultFilters(), section: "all", sort: "chronology" },
    );
    expect(new Set(items.map((i) => i.project.id)).size).toBe(items.length);
    expect(items[0].project.id).toBe("wakanda-eyes");
    expect(items.at(-1)?.project.chronology).toBeNull();
  });
  it("combines search, phase and favourites without renumbering the queue", () => {
    const r = {
      [film.id]: { ...markAll(film, emptyEntry(), true), favorite: true },
    };
    const f = {
      ...filmFilters(),
      status: "favorite",
      query: "Iron",
      phase: "1",
    };
    expect(selectWatchItems(r, f).map((i) => i.position)).toEqual([1]);
    expect(selectWatchItems(r, { ...f, hideWatched: true })).toHaveLength(0);
    const s = selectWatchItems(
      {},
      { ...defaultFilters(), type: "series", phase: "5", query: "Loki" },
    );
    expect(s.map((i) => i.season?.number)).toEqual([2]);
  });
});

describe("local-only catalogue preferences", () => {
  it("resolves watched/hidden conflicts in both directions and resets coherently", () => {
    let f = updateFilters(defaultFilters(), { hideWatched: true });
    f = updateFilters(f, { status: "watched" });
    expect(f.hideWatched).toBe(false);
    f = updateFilters(f, { hideWatched: true });
    expect(f.status).toBe("all");
    f = updateFilters(f, { status: "unwatched" });
    expect(f.hideWatched).toBe(true);
    f = updateFilters(f, { hideWatched: false });
    expect(f.status).toBe("all");
    expect(defaultFilters()).toMatchObject({
      section: "main",
      sort: "release",
      status: "all",
      hideWatched: false,
    });
  });
  it("persists per-device choices and safely handles malformed or unavailable storage", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => data.get(k) || null,
      setItem: (k: string, v: string) => data.set(k, v),
    });
    const f = {
      ...filmFilters(),
      section: "all" as const,
      hideWatched: true,
      query: "Стрэндж",
    };
    saveFilters(f);
    expect(loadFilters()).toEqual(f);
    data.set(FILTER_STORAGE_KEY, "{bad");
    expect(loadFilters()).toEqual(defaultFilters());
    data.set(FILTER_STORAGE_KEY, JSON.stringify({ version: 99, filters: f }));
    expect(loadFilters()).toEqual(defaultFilters());
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw Error("blocked");
      },
      setItem: () => {
        throw Error("quota");
      },
    });
    expect(loadFilters()).toEqual(defaultFilters());
    expect(() => saveFilters(f)).not.toThrow();
  });
  it("rejects unrecognised persisted enum values, fake booleans and oversized queries", () => {
    expect(
      normalizeFilters({
        section: "bad",
        type: [],
        status: "watched",
        hideWatched: true,
      }),
    ).toEqual({ ...defaultFilters(), status: "watched" });
    expect(normalizeFilters({ hideWatched: "true" }).hideWatched).toBe(false);
    expect(normalizeFilters({ query: "a".repeat(1000) }).query).toHaveLength(
      200,
    );
  });
});
