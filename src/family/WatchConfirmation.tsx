import { useEffect, useRef } from "react";
import { Check, Clock, Undo2, Bell } from "lucide-react";
import type { Project } from "../model";
import { catalog, today } from "../model";
import { useFamily } from "./FamilyProvider";
import { useAction, Feedback } from "./ui";
import type { WatchRequest } from "./types";

function actor(f: ReturnType<typeof useFamily>, id: string) {
  return f.snapshot.members.find((m) => m.user_id === id)?.role === "anton"
    ? "Антон"
    : "Таня";
}
export function WatchControls({
  project,
  done,
  className = "watch-button",
}: {
  project: Project;
  done: boolean;
  className?: string;
}) {
  const f = useFamily(),
    a = useAction();
  const pending = f.snapshot.watchRequests.find(
    (r) =>
      r.project_id === project.id && r.season === 0 && r.status === "pending",
  );
  const other = f.snapshot.members.find((m) => m.user_id !== f.user?.id);
  const mark = () =>
    a.run(async () => {
      const row = f.snapshot.entries.find((r) => r.project_id === project.id);
      await f.mutate(
        "entry",
        project.id,
        { watched: !done, watched_date: !done ? today() : null },
        row?.version || 0,
      );
    });
  if (pending) {
    const mine = pending.requested_by === f.user?.id;
    return (
      <div className="watch-pending">
        <span>
          <Clock size={14} />
          {pending.version === 0
            ? f.offline
              ? "Отправим после подключения"
              : "Отправляем…"
            : mine
              ? `Ждём: ${other ? actor(f, other.user_id) : "партнёр"}`
              : `${actor(f, pending.requested_by)} отметил просмотр`}
        </span>
        {mine ? (
          <button
            className="text-button"
            disabled={a.busy}
            onClick={() =>
              void a.run(async () => {
                const row = f.snapshot.entries.find(
                  (r) => r.project_id === project.id,
                );
                await f.mutate(
                  "entry",
                  project.id,
                  { watched: false, watched_date: null },
                  row?.version || 0,
                );
              })
            }
          >
            <Undo2 size={14} />
            Отменить отметку
          </button>
        ) : (
          <div className="watch-confirm-actions">
            <button
              className={className}
              disabled={a.busy || f.offline}
              onClick={() =>
                void a.run(() =>
                  f.mutate("watch_confirm", pending.id, {}, pending.version),
                )
              }
            >
              <Check size={14} />
              Да, посмотрели
            </button>
            <button
              className="text-button"
              disabled={a.busy || f.offline}
              onClick={() =>
                void a.run(() =>
                  f.mutate("watch_reject", pending.id, {}, pending.version),
                )
              }
            >
              Ещё смотрим
            </button>
          </div>
        )}
        <Feedback text={a.feedback} />
      </div>
    );
  }
  return (
    <div className="watch-control">
      <button
        className={className + (done ? " done" : "")}
        disabled={a.busy || project.section === "future" || !other}
        onClick={() => void mark()}
      >
        {done ? <Check size={14} /> : null}
        {a.busy
          ? "Сохраняем…"
          : !other
            ? "Сначала пригласите партнёра"
            : done
              ? "Просмотрено · отменить"
              : "Посмотрели"}
      </button>
      <Feedback text={a.feedback} />
    </div>
  );
}

export function WatchInbox({
  projectId,
  onProject,
  onNotice,
  hidden,
}: {
  projectId?: string;
  hidden?: boolean;
  onProject?: (id: string) => void;
  onNotice?: (text: string) => void;
}) {
  const f = useFamily(),
    a = useAction(),
    seen = useRef(new Set<string>());
  const pending = f.snapshot.watchRequests.filter(
    (r) =>
      r.status === "pending" &&
      r.requested_by !== f.user?.id &&
      r.version > 0 &&
      (!projectId || r.project_id === projectId),
  );
  const key = pending.map((r) => r.id + ":" + r.version).join("|");
  useEffect(() => {
    const next = pending.filter(
      (r) => !seen.current.has(r.id + ":" + r.version),
    );
    for (const r of pending) seen.current.add(r.id + ":" + r.version);
    if (next.length && onNotice)
      onNotice(
        `${actor(f, next[0].requested_by)} просит подтвердить просмотр «${catalog.find((p) => p.id === next[0].project_id)?.title || "фильма"}»`,
      );
  }, [key]);
  if (
    hidden ||
    !f.familyId ||
    f.localMode ||
    !f.snapshot.family?.watch_confirmation
  )
    return null;
  const own = f.snapshot.watchRequests.some(
    (r) =>
      r.status === "pending" &&
      r.requested_by === f.user?.id &&
      (!projectId || r.project_id === projectId),
  );
  if (
    !pending.length &&
    (!own || f.snapshot.profile?.notification_types.enabled)
  )
    return null;
  const groups = [...new Set(pending.map((r) => r.project_id))];
  async function answer(
    rows: WatchRequest[],
    kind: "watch_confirm" | "watch_reject",
  ) {
    await a.run(async () => {
      for (const r of rows) await f.mutate(kind, r.id, {}, r.version);
    });
  }
  return (
    <section
      className="watch-inbox"
      aria-label="Подтверждение совместного просмотра"
    >
      {groups.map((id) => {
        const rows = pending.filter((r) => r.project_id === id),
          p = catalog.find((p) => p.id === id);
        return (
          <div className="watch-invitation" key={id}>
            <div>
              <strong>{actor(f, rows[0].requested_by)} отметил просмотр</strong>
              <button
                className="text-button watch-project-title"
                onClick={() => onProject?.(id)}
              >
                {p?.title || id}
                {rows[0].season > 0 ? ` · ${rows.length} серий` : ""}
              </button>
              <p>Подтвердим, что посмотрели вместе?</p>
            </div>
            <div className="watch-confirm-actions">
              <button
                className="primary"
                disabled={a.busy || f.offline}
                onClick={() => void answer(rows, "watch_confirm")}
              >
                Да, посмотрели
              </button>
              <button
                className="wide-button"
                disabled={a.busy || f.offline}
                onClick={() => void answer(rows, "watch_reject")}
              >
                Ещё смотрим
              </button>
            </div>
          </div>
        );
      })}
      {!f.snapshot.profile?.notification_types.enabled && (
        <div className="watch-push-hint">
          <Bell size={17} />
          <p>Получайте запросы, даже когда приложение закрыто.</p>
          <button
            className="text-button"
            onClick={() => (location.hash = "/settings/notifications")}
          >
            Включить уведомления
          </button>
        </div>
      )}
      <Feedback text={a.feedback} />
    </section>
  );
}
