import type { Filters } from "./model";

export const FILTER_STORAGE_KEY = "our-marvel.catalog-filters.v1";
export const defaultFilters = (): Filters => ({
  query: "",
  section: "main",
  type: "all",
  status: "all",
  phase: "all",
  sort: "release",
  hideWatched: false,
  keepWatchedUnrated: false,
});
const choices = {
  section: ["main", "all", "defenders", "related", "animation", "future"],
  type: ["all", "film", "film-series", "series", "special"],
  status: ["all", "watched", "unwatched", "favorite"],
  phase: ["all", "1", "2", "3", "4", "5", "6"],
  sort: ["release", "chronology", "phase", "rating", "year"],
};
export function normalizeFilters(value: unknown): Filters {
  const result = defaultFilters();
  if (!value || typeof value !== "object" || Array.isArray(value))
    return result;
  const input = value as Record<string, unknown>;
  for (const key of Object.keys(choices) as (keyof typeof choices)[]) {
    const v = input[key];
    if (typeof v === "string" && choices[key].includes(v))
      (result as unknown as Record<string, unknown>)[key] = v;
  }
  if (typeof input.query === "string") result.query = input.query.slice(0, 200);
  result.hideWatched = input.hideWatched === true;
  result.keepWatchedUnrated = input.keepWatchedUnrated === true;
  if (result.status === "watched") result.hideWatched = false;
  if (result.status === "unwatched") result.hideWatched = true;
  return result;
}
export function updateFilters(
  current: Filters,
  patch: Partial<Filters>,
): Filters {
  const next = { ...current, ...patch };
  if (patch.hideWatched === true && next.status === "watched")
    next.status = "all";
  if (patch.hideWatched === false && next.status === "unwatched")
    next.status = "all";
  return normalizeFilters(next);
}
export function loadFilters(): Filters {
  try {
    const saved = JSON.parse(
      localStorage.getItem(FILTER_STORAGE_KEY) || "null",
    );
    return saved?.version === 1
      ? normalizeFilters(saved.filters)
      : defaultFilters();
  } catch {
    return defaultFilters();
  }
}
export function saveFilters(filters: Filters): void {
  try {
    localStorage.setItem(
      FILTER_STORAGE_KEY,
      JSON.stringify({ version: 1, filters: normalizeFilters(filters) }),
    );
  } catch {
    /* Private mode/quota must not prevent filtering in memory. */
  }
}
