import scale from "./xp-scale.json";
import registry from "./registry.json";
export type XPScale = Record<string, number>;
export const xpScale: XPScale = scale;
export function trophyXP(tier: string, rules: XPScale = xpScale) {
  const xp = rules[tier];
  if (!Number.isInteger(xp) || xp <= 0) throw Error("Unknown trophy XP tier");
  return xp;
}
export function rebaseCachedAwards<
  T extends { achievement_id: string; xp: number },
>(awards: T[], rules: XPScale = xpScale): T[] {
  return awards.map((a) => {
    const spec = registry.find((s) => s.id === a.achievement_id);
    return spec ? { ...a, xp: trophyXP(spec.displayTier, rules) } : a;
  });
}
export function ownerXP(awards: { owner: string; xp: number }[]) {
  return {
    family: awards
      .filter((a) => a.owner === "family")
      .reduce((n, a) => n + a.xp, 0),
    anton: awards
      .filter((a) => a.owner === "anton")
      .reduce((n, a) => n + a.xp, 0),
    tanya: awards
      .filter((a) => a.owner === "tanya")
      .reduce((n, a) => n + a.xp, 0),
  };
}

export function trophyNotificationTitle(
  n: { type: string; route: string; title: string },
  rules: XPScale = xpScale,
) {
  const id = n.route.split("/").at(-1);
  const spec = registry.find((s) => s.id === id);
  return n.type === "achievement" && spec
    ? n.title.replace(
        / · \+[0-9]+ XP$/,
        ` · +${trophyXP(spec.displayTier, rules)} XP`,
      )
    : n.title;
}
