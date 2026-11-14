export const tierLabels: Record<string, string> = {
  bronze: "БРОНЗА",
  silver: "СЕРЕБРО",
  gold: "ЗОЛОТО",
  platinum: "ПЛАТИНА",
} as const;
export type DisplayTier = keyof typeof tierLabels;
export const legacyXP = (rarity: string) =>
  ({ common: 10, rare: 25, epic: 50, legendary: 100 })[rarity] ?? 0;
export function routeAward(hash: string, ids: string[]) {
  const id = hash.replace(/^#\/?legend\/?/, "");
  return ids.includes(id) ? id : null;
}
export function parseNoticeSeen(raw: string | null): string[] {
  try {
    const value = JSON.parse(raw || "[]");
    return Array.isArray(value)
      ? [...new Set(value.filter((id): id is string => typeof id === "string"))]
      : [];
  } catch {
    return [];
  }
}
