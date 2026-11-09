import type { Operation, Snapshot } from "./types";

export function SyncDifference({
  op,
  snapshot,
}: {
  op: Operation;
  snapshot: Snapshot;
}) {
  if (op.state !== "conflict") return null;
  let row: Record<string, unknown> | undefined;
  let fields: [string, string][] = [];
  if (op.kind === "rating") {
    row = snapshot.ratings.find(
      (r) =>
        r.user_id === op.userId &&
        r.family_id === op.familyId &&
        r.project_id === op.target &&
        r.season === (op.payload.season ?? 0),
    );
    fields = [
      ["score", "Оценка"],
      ["favorite", "Избранное"],
    ];
  } else if (op.kind === "entry") {
    row = snapshot.entries.find(
      (r) => r.family_id === op.familyId && r.project_id === op.target,
    );
    fields = [
      ["watched", "Просмотрено"],
      ["watched_date", "Дата просмотра"],
      ["note", "Заметка"],
    ];
  } else if (op.kind === "episode") {
    row = snapshot.episodes.find(
      (r) =>
        r.family_id === op.familyId &&
        r.project_id === op.target &&
        r.season === op.payload.season &&
        r.episode === op.payload.episode,
    );
    fields = [
      [
        "watched",
        `Сезон ${op.payload.season}, серия ${op.payload.episode}: просмотрено`,
      ],
    ];
  }
  const format = (v: unknown) =>
    v === undefined || v === null || v === ""
      ? "Не задано"
      : typeof v === "boolean"
        ? v
          ? "Да"
          : "Нет"
        : String(v).slice(0, 200) + (String(v).length > 200 ? "…" : "");
  return (
    <>
      {fields
        .filter(([key]) => Object.hasOwn(op.payload, key))
        .map(([key, label]) => (
          <div key={key} className="sync-difference">
            <strong>{label}</strong>
            <p>На этом телефоне: {format(op.payload[key])}</p>
            <p>В общем списке: {format(row?.[key])}</p>
          </div>
        ))}
    </>
  );
}
export const actionName = (kind: string) =>
  ({
    entry: "Отметка о просмотре",
    episode: "Просмотр серии",
    rating: "Личная оценка",
    message: "Сообщение",
    letter: "Письмо",
    event: "Киновечер",
    session: "Совместный просмотр",
    moment: "Воспоминание",
    reaction: "Реакция",
  })[kind] || "Изменение";
