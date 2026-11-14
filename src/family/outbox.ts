import type { Operation } from "./types";
type Intent = Pick<
  Operation,
  "familyId" | "userId" | "kind" | "target" | "payload"
>;
export function outboxLane(o: Intent): string {
  const p = o.payload;
  let kind = o.kind.replace(/_(delete|read)$/, "");
  let suffix = "";
  if (kind === "rating") suffix = `:${o.userId}:${p.season ?? 0}`;
  if (kind === "episode") suffix = `:${p.season}:${p.episode}`;
  if (
    kind === "entry" &&
    typeof p.watched === "boolean" &&
    Object.keys(p).every((k) =>
      ["watched", "watched_date", "intent_at"].includes(k),
    )
  )
    kind = "watch_mark";
  if (kind === "reaction") suffix = `:${o.userId}:${p.kind}:${p.emoji}`;
  return `${o.familyId}:${kind}:${o.target}${suffix}`;
}
export function nextSendable(operations: Operation[]): Operation | undefined {
  const blocked = new Set(
    operations.filter((o) => o.state !== "queued").map(outboxLane),
  );
  return operations.find(
    (o) => o.state === "queued" && !blocked.has(outboxLane(o)),
  );
}
/** Retained for archive/export only; these drafts must never auto-send in 2.4. */
export function retiredCommunication(o:Pick<Operation,'kind'|'payload'>){return ['message','message_delete','letter','letter_delete','letter_read','letter_favorite'].includes(o.kind)||o.kind==='reaction'&&['message','letter'].includes(String(o.payload.kind));}
