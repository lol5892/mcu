import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type Entry,
  catalog,
  emptyEntry,
  itemWatched,
  markAll,
  nextRecommendation,
  selectWatchItems,
} from "./model";
import {
  defaultFilters,
  FILTER_STORAGE_KEY,
  loadFilters,
  normalizeFilters,
  saveFilters,
  updateFilters,
} from "./catalog-preferences";

const f = () => ({
  ...defaultFilters(),
  type: "film",
  hideWatched: true,
  keepWatchedUnrated: true,
});
afterEach(() => vi.unstubAllGlobals());
describe("keep watched projects awaiting either personal rating", () => {
  it.each([
    [
      false,
      false,
      ["iron-man", "thor", "avengers", "iron-man-3", "winter-soldier"],
    ],
    [
      false,
      true,
      ["iron-man", "thor", "avengers", "iron-man-3", "winter-soldier"],
    ],
    [true, false, ["winter-soldier"]],
    [true, true, ["thor", "avengers", "iron-man-3", "winter-soldier"]],
  ] as const)(
    "hide=%s keep-unrated=%s",
    (hideWatched, keepWatchedUnrated, expected) => {
      const records = {
        "iron-man": {
          ...emptyEntry(),
          watched: true,
          anton: 9,
          tanya: 10,
          note: "Не менять",
          date: "2026-11-07",
        },
        thor: { ...emptyEntry(), watched: true, anton: 8 },
        avengers: { ...emptyEntry(), watched: true },
        "iron-man-3": { ...emptyEntry(), watched: true, tanya: 9 },
        "winter-soldier": emptyEntry(),
      };
      const before = structuredClone(records),
        ids = Object.keys(records);
      const items = selectWatchItems(records, {
        ...f(),
        hideWatched,
        keepWatchedUnrated,
      }).filter((i) => ids.includes(i.project.id));
      expect(items.map((i) => i.project.id)).toEqual(expected);
      expect(records).toEqual(before);
      for (const item of items.filter((i) => i.project.id !== "winter-soldier"))
        expect(
          itemWatched(item, records[item.project.id as keyof typeof records]),
        ).toBe(true);
    },
  );
  it.each([
    [1, 10, false],
    [10, 1, false],
    [null, 10, true],
    [10, null, true],
    [null, null, true],
    [0, 9, true],
    [9, 11, true],
    [NaN, 9, true],
  ])("scores %s/%s retain=%s", (anton, tanya, retain) => {
    expect(
      selectWatchItems(
        { "iron-man": { ...emptyEntry(), watched: true, anton, tanya } },
        f(),
      ).some((i) => i.project.id === "iron-man"),
    ).toBe(retain);
  });
  it("keeps pending watching, hides on confirmation, restores on score removal without unwatching", () => {
    let r: Entry = { ...emptyEntry(), anton: 9, tanya: 10 };
    const visible = () =>
      selectWatchItems({ "iron-man": r }, f()).some(
        (i) => i.project.id === "iron-man",
      );
    expect(visible()).toBe(true); // Pending/rejected progress is still false in the existing projection.
    r = { ...r, watched: true };
    expect(visible()).toBe(false);
    r = { ...r, tanya: null as number | null };
    expect(visible()).toBe(true);
    expect(r.watched).toBe(true);
    r = { ...r, tanya: 7 };
    expect(visible()).toBe(false);
  });
  it("uses project ratings for every completed season and keeps partial seasons", () => {
    const project = catalog.find((p) => p.id === "loki")!;
    let r: Entry = {
      ...emptyEntry(),
      episodes: [...Array.from({ length: 6 }, (_, i) => `1:${i + 1}`), "2:1"],
      anton: 9,
      tanya: null as number | null,
    };
    const filter = { ...f(), type: "series", query: "Локи" };
    expect(
      selectWatchItems({ loki: r }, filter).map((i) => i.season?.number),
    ).toEqual([1, 2]);
    r = { ...r, tanya: 8 };
    expect(
      selectWatchItems({ loki: r }, filter).map((i) => i.season?.number),
    ).toEqual([2]);
    r = markAll(project, r, true);
    expect(selectWatchItems({ loki: r }, filter)).toHaveLength(0);
    r = { ...r, tanya: null };
    expect(
      selectWatchItems({ loki: r }, filter).map((i) => i.season?.number),
    ).toEqual([1, 2]);
  });
  it("applies equally to One-Shots and specials", () => {
    for (const p of catalog.filter(
      (p) => p.type === "special" && p.section === "main",
    )) {
      const filter = { ...f(), type: "special" };
      const r = markAll(p, emptyEntry(), true);
      expect(
        selectWatchItems({ [p.id]: r }, filter).some(
          (i) => i.project.id === p.id,
        ),
      ).toBe(true);
      expect(
        selectWatchItems(
          { [p.id]: { ...r, anton: 1, tanya: 10 } },
          filter,
        ).some((i) => i.project.id === p.id),
      ).toBe(false);
    }
  });
  it("keeps unrated watched movies in the list but never recommends watching them again", () => {
    const records = {
      "iron-man": { ...emptyEntry(), watched: true, anton: 9 },
    };
    expect(selectWatchItems(records, f())[0].project.id).toBe("iron-man");
    expect(nextRecommendation(records, f())?.project.id).toBe("hulk");
    expect(
      nextRecommendation(records, {
        ...f(),
        query: "Железный человек",
        sort: "chronology",
      })?.project.id,
    ).not.toBe("iron-man");
  });
  it("defaults safely for old preferences and retains the choice while hiding is disabled", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => data.get(k) || null,
      setItem: (k: string, v: string) => data.set(k, v),
    });
    data.set(
      FILTER_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        filters: { hideWatched: true, type: "film" },
      }),
    );
    expect(loadFilters()).toMatchObject({
      hideWatched: true,
      keepWatchedUnrated: false,
      type: "film",
    });
    const disabled = updateFilters(f(), { hideWatched: false });
    saveFilters(disabled);
    expect(loadFilters()).toMatchObject({
      hideWatched: false,
      keepWatchedUnrated: true,
    });
    expect(
      normalizeFilters({ keepWatchedUnrated: "true" }).keepWatchedUnrated,
    ).toBe(false);
  });
});
