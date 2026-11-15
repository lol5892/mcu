import { accountCacheKeys, clearAccountCache } from "./local-privacy";
import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { supportURL } from "./config";
import { slotName, memberName, pairName } from "./names";
import {
  affectedTables,
  realtimeFilter,
  snapshotTables,
  boundedHistory,
} from "./snapshot-plan";
import { blankSnapshot } from "../family/types";
it("uses actual names independently of stable internal slot identifiers", () => {
  const s = blankSnapshot();
  s.members = [
    {
      family_id: "one",
      user_id: "alice",
      role: "anton",
      display_name: "Оля",
      joined_at: "now",
    },
    {
      family_id: "one",
      user_id: "bob",
      role: "tanya",
      display_name: "Максим",
      joined_at: "now",
    },
  ];
  expect(slotName(s, "anton")).toBe("Оля");
  expect(memberName(s, "bob")).toBe("Максим");
  expect(pairName(s)).toBe("Оля + Максим");
  expect(memberName(s, "other")).toBe("Участник");
});
it("never activates an unapproved or unsafe donation link", () => {
  expect(supportURL("https://boosty.to/example", false)).toBeNull();
  expect(supportURL(undefined, true)).toBeNull();
  expect(supportURL("javascript:alert(1)", true)).toBeNull();
  expect(supportURL("https://user:secret@example.test", true)).toBeNull();
  expect(supportURL("https://boosty.to/example", true)).toBe(
    "https://boosty.to/example",
  );
});
it("excludes retired messaging data from snapshots and bounds history pages", () => {
  for (const table of [
    "mv_messages",
    "mv_letters",
    "mv_letter_favorites",
    "mv_welcome",
    "mv_legacy_ratings",
    "mv_rating_history",
  ])
    expect(Object.values(snapshotTables)).not.toContain(table);
  expect(boundedHistory.sessions?.limit).toBe(50);
  expect(affectedTables("rating")).toEqual(["ratings", "notifications"]);
  expect(affectedTables("watch_confirm")).toContain("entries");
  expect(realtimeFilter("entries", "family1", "me")).toBe(
    "family_id=eq.family1",
  );
  expect(realtimeFilter("notifications", "family1", "me")).toBe(
    "recipient_id=eq.me",
  );
  expect(realtimeFilter("profile", "family1", "me")).toBe("id=eq.me");
});
it("has fail-closed closed beta and prevents attaching a new partner to former partner history", () => {
  const sql = readFileSync(
    "supabase/public-migrations/20261115223300_public_beta.sql",
    "utf8",
  );
  expect(sql).toContain("PUBLIC_EMPTY_DATABASE_REQUIRED");
  expect(sql).toContain(
    "create trigger kv_closed_beta before insert on auth.users",
  );
  expect(sql).toContain("accepting_families boolean not null default false");
  expect(sql).toContain("NEW_UNIVERSE_REQUIRED");
  expect(sql).toContain("partner_linked_once=true");
});

it("clears only the signed-out account data without touching another account or Auth keys", () => {
  const map = new Map([
    ["mv-legend:family:me", "data"],
    ["mv-impression-draft:family:me:iron-man", "draft"],
    ["mv-legend:other:someone", "other"],
    ["sb-auth-token", "session"],
  ]);
  const storage = {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] || null,
    removeItem: (key: string) => {
      map.delete(key);
    },
  } as Storage;
  expect(accountCacheKeys(storage, "me")).toHaveLength(2);
  clearAccountCache(storage, "me");
  expect([...map.keys()]).toEqual(["mv-legend:other:someone", "sb-auth-token"]);
});
