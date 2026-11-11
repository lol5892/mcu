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

// A server-side cancellation is an explicit correction of older accidental
// marks. Drop only the obsolete watch/date intent, never an unsaved note.
export function supersededWatch(s: Snapshot, op: Operation): boolean {
  if (
    !s.family?.watch_confirmation ||
    !["entry", "episode"].includes(op.kind) ||
    op.payload.watched !== true
  )
    return false;
  const allowed =
    op.kind === "entry"
      ? ["watched", "watched_date", "intent_at"]
      : ["season", "episode", "watched", "intent_at"];
  if (Object.keys(op.payload).some((k) => !allowed.includes(k))) return false;
  return (s.watchRequests || []).some(
    (r) =>
      r.family_id === op.familyId &&
      r.project_id === op.target &&
      r.season === (op.payload.season ?? 0) &&
      r.episode === (op.payload.episode ?? 0) &&
      op.expected < r.base_version &&
      !(
        typeof op.payload.intent_at === "string" &&
        Date.parse(op.payload.intent_at) >
          Date.parse(r.responded_at || r.requested_at)
      ),
  );
}
