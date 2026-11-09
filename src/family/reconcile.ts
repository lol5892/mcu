import type { Operation, Snapshot } from "./types";

// A duplicate effect can be acknowledged without writing anything. Never infer
// success for unsupported actions, unknown fields, another user or another season.
export function operationSatisfied(s: Snapshot, op: Operation): boolean {
  const p = op.payload;
  let row: Record<string, unknown> | undefined;
  let allowed: string[];
  switch (op.kind) {
    case "entry":
      row = s.entries.find(
        (r) => r.family_id === op.familyId && r.project_id === op.target,
      );
      allowed = ["watched", "watched_date", "note"];
      break;
    case "episode":
      if (!Object.hasOwn(p, "watched")) return false;
      row = s.episodes.find(
        (r) =>
          r.family_id === op.familyId &&
          r.project_id === op.target &&
          r.season === p.season &&
          r.episode === p.episode,
      );
      allowed = ["season", "episode", "watched"];
      break;
    case "rating":
      if (!Object.hasOwn(p, "score") && !Object.hasOwn(p, "favorite"))
        return false;
      row = s.ratings.find(
        (r) =>
          r.family_id === op.familyId &&
          r.project_id === op.target &&
          r.user_id === op.userId &&
          r.season === (p.season ?? 0),
      );
      allowed = ["season", "score", "favorite"];
      break;
    default:
      return false;
  }
  const keys = Object.keys(p);
  return Boolean(
    row &&
    keys.length &&
    keys.every((k) => allowed.includes(k) && Object.is(row![k], p[k])),
  );
}
