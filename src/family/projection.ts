import { catalog, emptyEntry, watched, type Records } from "../model";
import type { Snapshot, Operation, Role } from "./types";
export function legacyProjection(s: Snapshot, user: string): Records {
  const rows: Records = {};
  const roles = new Map(s.members.map((m) => [m.user_id, m.role]));
  for (const e of s.entries)
    rows[e.project_id] = {
      ...emptyEntry(),
      watched: e.watched,
      date: e.watched_date || "",
      note: e.note,
      updatedAt: e.updated_at,
    };
  for (const e of s.episodes)
    if (e.watched) {
      rows[e.project_id] ??= emptyEntry();
      rows[e.project_id].episodes.push(`${e.season}:${e.episode}`);
    }
  for (const r of s.ratings)
    if (r.season === 0) {
      rows[r.project_id] ??= emptyEntry();
      const role = roles.get(r.user_id);
      if (role) rows[r.project_id][role] = r.score;
      if (r.user_id === user) rows[r.project_id].favorite = r.favorite;
    }
  for (const p of catalog)
    if (p.type === "series" && rows[p.id])
      rows[p.id].watched = watched(p, rows[p.id]);
  return rows;
}
export function applyOptimistic(s: Snapshot, op: Operation): Snapshot {
  const n = structuredClone(s);
  const p = op.payload;
  const f = op.familyId;
  const u = op.userId;
  if (op.kind === "entry") {
    const i = n.entries.findIndex((e) => e.project_id === op.target);
    const row =
      i < 0
        ? {
            family_id: f,
            project_id: op.target,
            watched: false,
            watched_date: null,
            note: "",
            version: 0,
            updated_by: u,
            updated_at: "",
          }
        : n.entries[i];
    Object.assign(row, p, {
      version: op.expected + 1,
      updated_by: u,
      updated_at: op.createdAt,
    });
    if (i < 0) n.entries.push(row);
  }
  if (op.kind === "episode") {
    const i = n.episodes.findIndex(
      (e) =>
        e.project_id === op.target &&
        e.season === p.season &&
        e.episode === p.episode,
    );
    const row = {
      family_id: f,
      project_id: op.target,
      season: Number(p.season),
      episode: Number(p.episode),
      watched: Boolean(p.watched),
      version: op.expected + 1,
      updated_by: u,
    };
    if (i < 0) n.episodes.push(row);
    else n.episodes[i] = row;
  }
  if (op.kind === "rating") {
    const season = Number(p.season || 0);
    const i = n.ratings.findIndex(
      (r) =>
        r.user_id === u && r.project_id === op.target && r.season === season,
    );
    const row =
      i < 0
        ? {
            family_id: f,
            user_id: u,
            project_id: op.target,
            season,
            score: null,
            favorite: false,
            version: 0,
            updated_at: "",
          }
        : n.ratings[i];
    Object.assign(row, p, {
      version: op.expected + 1,
      updated_at: op.createdAt,
    });
    if (i < 0) n.ratings.push(row);
  }
  if (op.kind === "message" && !n.messages.some((m) => m.id === op.target))
    n.messages.push({
      id: op.target,
      family_id: f,
      author_id: u,
      scope: p.scope as "chat",
      target: String(p.target || ""),
      body: String(p.body || ""),
      spoiler: Boolean(p.spoiler),
      reply_to: p.reply_to ? String(p.reply_to) : null,
      version: 1,
      created_at: op.createdAt,
      edited_at: null,
      deleted_at: null,
    });
  return n;
}
export function personalName(s: Snapshot, id: string) {
  return s.members.find((m) => m.user_id === id)?.role === "tanya"
    ? "Таня"
    : "Антон";
}
export function roleName(role: Role) {
  return role === "anton" ? "Антон" : "Таня";
}
