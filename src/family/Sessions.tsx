import { useState } from "react";
import { Play, CheckCheck, Clock3, Users, ArrowLeft } from "lucide-react";
import { catalog, progress } from "../model";
import { useFamily } from "./FamilyProvider";
import { useAction, Feedback, Person, Reactions, displayDate } from "./ui";
import { PhotoUpload, PrivatePhoto } from "./media";
import { Chat } from "./Chat";
export function SeasonRatings({ projectId }: { projectId: string }) {
  const f = useFamily(),
    a = useAction();
  const project = catalog.find((p) => p.id === projectId)!;
  const seasons =
    project.type === "series"
      ? [0, ...project.seasons.map((s) => s.number)]
      : [0];
  return (
    <section className="season-ratings">
      <h3>
        {project.type === "series"
          ? "Наши оценки по сезонам"
          : "Наши впечатления"}
      </h3>
      {seasons.map((season) => {
        const rows = f.snapshot.ratings.filter(
          (r) => r.project_id === projectId && r.season === season,
        );
        const own = rows.find((r) => r.user_id === f.user?.id);
        const anton = rows.find(
          (r) =>
            f.snapshot.members.find((m) => m.user_id === r.user_id)?.role ===
            "anton",
        )?.score;
        const tanya = rows.find(
          (r) =>
            f.snapshot.members.find((m) => m.user_id === r.user_id)?.role ===
            "tanya",
        )?.score;
        const canRate =
          project.type === "series"
            ? f.snapshot.episodes.some(
                (e) =>
                  e.project_id === projectId &&
                  e.watched &&
                  (season === 0 || e.season === season),
              )
            : f.records[projectId]?.watched;
        return (
          <div key={season} className="season-rating-row">
            <div>
              <strong>
                {season
                  ? `Сезон ${season}`
                  : project.type === "series"
                    ? "Сериал целиком"
                    : "Фильм"}
              </strong>
              <small>
                Антон: {anton ?? "—"} · Таня: {tanya ?? "—"} · Вместе:{" "}
                {anton != null && tanya != null
                  ? ((anton + tanya) / 2).toFixed(1)
                  : "—"}
              </small>
            </div>
            <label>
              Моя
              <select
                aria-label={`Моя оценка ${season ? "сезона " + season : "проекта"}`}
                disabled={!canRate || a.busy}
                value={own?.score ?? ""}
                onChange={(e) =>
                  void a.run(() =>
                    f.mutate(
                      "rating",
                      projectId,
                      {
                        season,
                        score: e.target.value ? Number(e.target.value) : null,
                      },
                      own?.version || 0,
                    ),
                  )
                }
              >
                <option value="">—</option>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
        );
      })}
      <p className="muted">
        Каждый меняет только собственную оценку. Для оценки сезона достаточно
        начать его смотреть; завершения остальных сезонов не требуется.
      </p>
      <Feedback text={a.feedback} />
    </section>
  );
}
export function ProjectFamilyTools({ projectId }: { projectId: string }) {
  const f = useFamily(),
    a = useAction();
  const [chat, setChat] = useState(false);
  if (!f.familyId || f.localMode) return null;
  return (
    <section className="project-family-tools">
      <h3>Наша история этого просмотра</h3>
      <div className="project-social-actions">
        <button
          className="primary"
          disabled={a.busy || f.offline}
          onClick={() =>
            void a.run(async () => {
              const active = f.snapshot.sessions.find(
                (s) => s.status === "active",
              );
              const id = active?.id || crypto.randomUUID();
              if (active && active.project_id !== projectId)
                throw Error("Сначала завершите текущий совместный сеанс.");
              if (!active)
                await f.mutate("session", id, { project_id: projectId });
              location.hash = "/sessions/" + id;
            })
          }
        >
          <Play size={16} />
          Начать совместный просмотр
        </button>
        <button
          className="wide-button"
          onClick={() => (location.hash = "/events/new-" + projectId)}
        >
          Назначить киновечер
        </button>
      </div>
      <SeasonRatings projectId={projectId} />
      <button className="wide-button" onClick={() => setChat(!chat)}>
        Наши комментарии (
        {
          f.snapshot.messages.filter(
            (m) => m.scope === "project" && m.target === projectId,
          ).length
        }
        )
      </button>
      {chat && (
        <Chat scope="project" target={projectId} title="Обсудим эту историю" />
      )}
      <Feedback text={a.feedback} />
    </section>
  );
}
export function Sessions({
  initialId,
  onRate,
}: {
  initialId?: string;
  onRate: (projectId: string) => void;
}) {
  const f = useFamily(),
    a = useAction();
  const [selected, setSelected] = useState(
      initialId ||
        f.snapshot.sessions.find((s) => s.status === "active")?.id ||
        "",
    ),
    [minute, setMinute] = useState("");
  const session = f.snapshot.sessions.find((s) => s.id === selected);
  if (!session)
    return (
      <div>
        <div className="page-heading">
          <div className="eyebrow">КОМПАНЬОН К НАШЕМУ ТЕЛЕВИЗОРУ</div>
          <h1>Смотрим вместе</h1>
          <p>Видео остаётся на телевизоре, а впечатления — здесь.</p>
        </div>
        <div className="sessions-list">
          {[...f.snapshot.sessions]
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .map((s) => (
              <button
                className="session-tile"
                key={s.id}
                onClick={() => setSelected(s.id)}
              >
                <Play size={22} />
                <div>
                  <h3>{catalog.find((p) => p.id === s.project_id)?.title}</h3>
                  <small>
                    {s.status === "active"
                      ? "СМОТРИМ СЕЙЧАС"
                      : "НАШ ПРОШЛЫЙ ВЕЧЕР"}{" "}
                    · {displayDate(s.created_at)}
                  </small>
                </div>
              </button>
            ))}
        </div>
        {!f.snapshot.sessions.length && (
          <div className="empty">
            <Play />
            <h2>Наш следующий вечер впереди</h2>
            <p>Откройте фильм и нажмите «Начать совместный просмотр».</p>
          </div>
        )}
      </div>
    );
  const project = catalog.find((p) => p.id === session.project_id)!;
  return (
    <div className="viewing-session">
      <button className="text-button" onClick={() => setSelected("")}>
        <ArrowLeft size={16} />
        История сеансов
      </button>
      <div className="session-hero">
        <img
          src={import.meta.env.BASE_URL + project.poster}
          alt={project.title}
        />
        <div>
          <div className="eyebrow">
            <span className="red-dot" />
            {session.status === "active"
              ? "СМОТРИМ СЕЙЧАС"
              : "ЭТО БЫЛ НАШ ВЕЧЕР"}
          </div>
          <h1>{project.title}</h1>
          <div className="session-people">
            {session.participants.map((id) => (
              <Person key={id} id={id} />
            ))}
          </div>
          {session.status === "active" &&
            !session.participants.includes(f.user!.id) && (
              <button
                className="primary"
                disabled={a.busy || f.offline}
                onClick={() =>
                  void a.run(() =>
                    f.mutate("session", session.id, {}, session.version),
                  )
                }
              >
                <Users size={16} />Я тоже здесь ❤️
              </button>
            )}
        </div>
      </div>
      {session.status === "active" ? (
        <>
          <Reactions kind="session" id={session.id} />
          <form
            className="manual-minute"
            onSubmit={(e) => {
              e.preventDefault();
              void a.run(() =>
                f.mutate(
                  "session",
                  session.id,
                  { film_minute: Number(minute) },
                  session.version,
                ),
              );
            }}
          >
            <Clock3 size={17} />
            <label>
              Сейчас на {session.film_minute}-й минуте
              <input
                type="number"
                min="0"
                max="1440"
                aria-label="Минута фильма"
                placeholder="Минута"
                value={minute}
                onChange={(e) => setMinute(e.target.value)}
              />
            </label>
            <button
              className="primary"
              disabled={a.busy || !minute || f.offline}
            >
              Отметить
            </button>
          </form>
          <p className="muted">
            Это ручная пометка, а не синхронизация воспроизведения фильма.
          </p>
        </>
      ) : (
        <section className="panel">
          <h2>Сохраним послевкусие</h2>
          <p>Оцените историю и напишите, что осталось после титров.</p>
          <SeasonRatings projectId={project.id} />
          <button className="wide-button" onClick={() => onRate(project.id)}>
            Открыть карточку и отметить просмотр
          </button>
        </section>
      )}
      <Chat scope="session" target={session.id} title="На одной волне" />
      <div className="session-photo-grid">
        {f.snapshot.media
          .filter(
            (m) =>
              m.ready && m.kind === "session" && m.target_id === session.id,
          )
          .map((m) => (
            <PrivatePhoto key={m.id} media={m} />
          ))}
      </div>
      <PhotoUpload kind="session" target={session.id} />
      {session.status === "active" && (
        <button
          className="wide-button completed"
          disabled={a.busy || f.offline}
          onClick={() =>
            void a.run(() =>
              f.mutate(
                "session",
                session.id,
                { status: "finished" },
                session.version,
              ),
            )
          }
        >
          <CheckCheck size={18} />
          Завершить наш просмотр
        </button>
      )}
      <Feedback text={a.feedback} />
    </div>
  );
}
