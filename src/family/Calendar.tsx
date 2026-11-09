import { useEffect, useState } from "react";
import { CalendarHeart, Check, Clock3, X, Plus, MapPin } from "lucide-react";
import { catalog } from "../model";
import { useFamily } from "./FamilyProvider";
import { useAction, Feedback, Person, displayDate } from "./ui";
import type { Evening } from "./types";
export function countdown(date: string, now = Date.now()) {
  const minutes = Math.max(
    0,
    Math.ceil((new Date(date).getTime() - now) / 60000),
  );
  if (minutes === 0) return "Пора устраиваться поудобнее";
  const days = Math.floor(minutes / 1440),
    hours = Math.floor((minutes % 1440) / 60),
    mins = minutes % 60;
  return days
    ? `Через ${days} дн. ${hours} ч.`
    : hours
      ? `Через ${hours} ч. ${mins} мин.`
      : `Через ${mins} мин.`;
}
export function NextEvening() {
  const f = useFamily();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const e = f.snapshot.events
    .filter(
      (e) =>
        e.status !== "cancelled" &&
        new Date(e.starts_at).getTime() > now - 3600000,
    )
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
  if (!e) return null;
  return (
    <button
      className="next-evening"
      onClick={() => (location.hash = "/events/" + e.id)}
    >
      <CalendarHeart size={29} />
      <div>
        <small>НАШ БЛИЖАЙШИЙ КИНОВЕЧЕР</small>
        <h3>{catalog.find((p) => p.id === e.project_id)?.title}</h3>
        <span>
          {displayDate(e.starts_at)} · {countdown(e.starts_at, now)}
        </span>
      </div>
      <span>♡</span>
    </button>
  );
}
export function Calendar({ initialProject }: { initialProject?: string }) {
  const f = useFamily(),
    a = useAction();
  const [creating, setCreating] = useState(Boolean(initialProject)),
    [project, setProject] = useState(initialProject || "iron-man"),
    [date, setDate] = useState(""),
    [location, setLocation] = useState("Дома"),
    [note, setNote] = useState(""),
    [season, setSeason] = useState(""),
    [episode, setEpisode] = useState(""),
    [propose, setPropose] = useState<string | null>(null),
    [proposedDate, setProposedDate] = useState(""),
    [history, setHistory] = useState(false),
    [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const chosen = catalog.find((p) => p.id === project);
  const rows = f.snapshot.events
    .filter((e) =>
      history
        ? new Date(e.starts_at).getTime() < Date.now() ||
          e.status === "cancelled"
        : new Date(e.starts_at).getTime() >= Date.now() &&
          e.status !== "cancelled",
    )
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  async function act(e: Evening, status: string) {
    await a.run(() =>
      f.mutate(
        "event",
        e.id,
        {
          status,
          ...(status === "proposed"
            ? { proposed_at: new Date(proposedDate).toISOString() }
            : {}),
        },
        e.version,
      ),
    );
    setPropose(null);
  }
  return (
    <div className="calendar-page">
      <div className="feature-heading">
        <div>
          <div className="eyebrow">БЕРЕЖНО СОХРАНЯЕМ ВРЕМЯ ДЛЯ НАС</div>
          <h1>Наши киновечера</h1>
          <p>Пусть у счастья будет место в календаре.</p>
        </div>
        <button
          className="round-add"
          aria-label="Назначить киновечер"
          onClick={() => setCreating(!creating)}
        >
          <Plus />
        </button>
      </div>
      <NextEvening />
      {creating && (
        <form
          className="panel family-form"
          onSubmit={(e) => {
            e.preventDefault();
            void a.run(async () => {
              if (!date) throw Error("Выберите дату и время");
              await f.mutate("event", crypto.randomUUID(), {
                project_id: project,
                starts_at: new Date(date).toISOString(),
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                location,
                note,
                season: season ? Number(season) : null,
                episode: episode ? Number(episode) : null,
              });
              setCreating(false);
              setDate("");
              setNote("");
            });
          }}
        >
          <h2>Забронируем вечер для двоих</h2>
          <label>
            Что смотрим
            <select
              aria-label="Фильм киновечера"
              value={project}
              onChange={(e) => {
                setProject(e.target.value);
                setSeason("");
                setEpisode("");
              }}
            >
              {catalog
                .filter((p) => p.section !== "future")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
            </select>
          </label>
          {chosen?.type === "series" && (
            <div className="form-columns">
              <label>
                Сезон
                <select
                  aria-label="Сезон киновечера"
                  value={season}
                  onChange={(e) => {
                    setSeason(e.target.value);
                    setEpisode("");
                  }}
                >
                  <option value="">Выберем вместе</option>
                  {chosen.seasons.map((s) => (
                    <option key={s.number} value={s.number}>
                      {s.number}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Серия
                <select
                  aria-label="Серия киновечера"
                  value={episode}
                  onChange={(e) => setEpisode(e.target.value)}
                >
                  <option value="">Несколько серий</option>
                  {Array.from(
                    {
                      length:
                        chosen.seasons.find((s) => s.number === Number(season))
                          ?.episodes || 0,
                    },
                    (_, i) => i + 1,
                  ).map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <label>
            Дата и время
            <input
              type="datetime-local"
              required
              aria-label="Дата и время киновечера"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <small>
              {Intl.DateTimeFormat().resolvedOptions().timeZone}. На другом
              iPhone время отобразится в его часовом поясе.
            </small>
          </label>
          <label>
            Место
            <input
              aria-label="Место киновечера"
              maxLength={300}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </label>
          <label>
            Комментарий
            <textarea
              aria-label="Комментарий киновечера"
              value={note}
              maxLength={2000}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Наш вечер с пиццей ❤️"
            />
          </label>
          <button className="primary" disabled={a.busy || f.offline}>
            Пригласить на киновечер ❤️
          </button>
        </form>
      )}
      <div className="section-pills personal-tabs">
        <button
          className={!history ? "selected" : ""}
          onClick={() => setHistory(false)}
        >
          Впереди
        </button>
        <button
          className={history ? "selected" : ""}
          onClick={() => setHistory(true)}
        >
          История
        </button>
      </div>
      <section className="calendar-strip">
        <label>
          Календарь
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </label>
        <div>
          {Array.from(
            {
              length: new Date(
                Number(month.slice(0, 4)),
                Number(month.slice(5)),
                0,
              ).getDate(),
            },
            (_, i) => i + 1,
          ).map((day) => {
            const key = `${month}-${String(day).padStart(2, "0")}`;
            const count = f.snapshot.events.filter(
              (e) =>
                e.status !== "cancelled" &&
                new Date(e.starts_at).toLocaleDateString("en-CA") === key,
            ).length;
            return (
              <span key={day} className={count ? "has-event" : ""}>
                {day}
                {count > 0 && <i />}
              </span>
            );
          })}
        </div>
      </section>
      <div className="evenings-list">
        {rows.map((e) => (
          <article className="panel evening-card" key={e.id}>
            <div className="eyebrow">
              {e.status === "confirmed"
                ? "НАШ ВЕЧЕР ПОДТВЕРЖДЁН"
                : e.status === "proposed"
                  ? "ЕСТЬ ДРУГОЕ ПРЕДЛОЖЕНИЕ"
                  : e.status === "cancelled"
                    ? "ОТМЕНЁН"
                    : "ПРИГЛАШЕНИЕ ДЛЯ ДВОИХ"}
            </div>
            <h2>{catalog.find((p) => p.id === e.project_id)?.title}</h2>
            <div className="event-time">
              <CalendarHeart size={17} />
              {displayDate(e.starts_at)}
              {e.season && (
                <span>
                  С{e.season}
                  {e.episode ? ` · Э${e.episode}` : ""}
                </span>
              )}
            </div>
            {e.proposed_at && e.status === "proposed" && (
              <p className="gold">Предложено: {displayDate(e.proposed_at)}</p>
            )}
            <p>{e.note}</p>
            <div className="event-location">
              <MapPin size={14} />
              {e.location || "Выберем вместе"}
            </div>
            <Person id={e.author_id} />
            {!history && (
              <div className="event-actions">
                {((e.status === "proposed" && e.proposed_by !== f.user?.id) ||
                  (e.status !== "proposed" && e.author_id !== f.user?.id)) &&
                  e.status !== "confirmed" && (
                    <button
                      className="primary"
                      disabled={a.busy || f.offline}
                      onClick={() => void act(e, "confirmed")}
                    >
                      <Check size={15} />
                      Подтвердить
                    </button>
                  )}
                <button
                  className="text-button"
                  onClick={() => {
                    setPropose(e.id);
                    setProposedDate("");
                  }}
                >
                  <Clock3 size={15} />
                  Другое время
                </button>
                <button
                  className="text-button"
                  disabled={a.busy || f.offline}
                  onClick={() => {
                    if (confirm("Отменить этот киновечер?"))
                      void act(e, "cancelled");
                  }}
                >
                  <X size={15} />
                  Отменить
                </button>
              </div>
            )}
            {propose === e.id && (
              <div className="propose-time">
                <input
                  aria-label="Предложенное время"
                  type="datetime-local"
                  value={proposedDate}
                  onChange={(e) => setProposedDate(e.target.value)}
                />
                <button
                  className="primary"
                  disabled={!proposedDate || a.busy || f.offline}
                  onClick={() => void act(e, "proposed")}
                >
                  Предложить
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
      {!rows.length && !creating && (
        <div className="empty">
          <CalendarHeart />
          <h2>
            {history
              ? "Наша история ещё впереди"
              : "Найдём время друг для друга"}
          </h2>
          <p>Выберите историю, а к ней — уютный вечер.</p>
        </div>
      )}
      <Feedback text={a.feedback} />
    </div>
  );
}
