import { useEffect, useState } from "react";
import { Play, CheckCheck, Clock3, Users, ArrowLeft, Search, ChevronRight, Film, Heart } from "lucide-react";
import { available, catalog, today, type Project } from "../model";
import { useFamily } from "./FamilyProvider";
import { useAction, Feedback, Person, Reactions, Sheet, displayDate } from "./ui";
import { PrivatePhoto, SaveToMoments, mediaForTarget } from "./media";
import { Chat } from "./Chat";
import { WatchControls } from "./WatchConfirmation";
import type { ViewingSession } from "./types";
import "./sessions.css";

const released = (project: Project) => project.section !== "future" && project.date <= today();
const episodeLabel = (session: ViewingSession) => session.season && session.episode ? `Сезон ${session.season} · серия ${session.episode}` : "";

export function SeasonRatings({ projectId }: { projectId: string }) {
  const f = useFamily(), a = useAction();
  const project = catalog.find((p) => p.id === projectId);
  if (!project) return null;
  const seasons = project.type === "series" ? [0, ...project.seasons.map((s) => s.number)] : [0];
  return <section className="season-ratings">
    <h3>{project.type === "series" ? "Наши оценки по сезонам" : "Наши впечатления"}</h3>
    {seasons.map((season) => {
      const rows = f.snapshot.ratings.filter((r) => r.project_id === projectId && r.season === season);
      const own = rows.find((r) => r.user_id === f.user?.id);
      const score = (role: string) => rows.find((r) => f.snapshot.members.find((m) => m.user_id === r.user_id)?.role === role)?.score;
      const anton = score("anton"), tanya = score("tanya");
      return <div key={season} className="season-rating-row">
        <div><strong>{season ? `Сезон ${season}` : project.type === "series" ? "Сериал целиком" : "Фильм"}</strong><small>Антон: {anton ?? "—"} · Таня: {tanya ?? "—"} · Вместе: {anton != null && tanya != null ? ((anton + tanya) / 2).toFixed(1) : "—"}</small></div>
        <label>Моя оценка<select aria-label={`Моя оценка ${season ? "сезона " + season : "проекта"}`} disabled={a.busy} value={own?.score ?? ""} onChange={(e) => { const value = e.target.value; void a.run(() => f.mutate("rating", projectId, { season, score: value ? Number(value) : null }, own?.version || 0)); }}><option value="">—</option>{Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} / 10</option>)}</select></label>
      </div>;
    })}
    <p className="muted">Каждый меняет только свою оценку. Её можно поставить в любое время, независимо от просмотра.</p><Feedback text={a.feedback} />
  </section>;
}

export function StartTogether({ projectId }: { projectId: string }) {
  const f = useFamily(), a = useAction();
  const project = catalog.find((p) => p.id === projectId);
  const [choosing, setChoosing] = useState(false);
  const [season, setSeason] = useState(0), [episode, setEpisode] = useState(1);
  if (!project || !f.familyId || f.localMode) return null;
  const active = f.snapshot.sessions.find((s) => s.status === "active");
  const availableSeasons = project.seasons.filter((s) => available(project, s, 1));
  const pickedSeason = availableSeasons.find((s) => s.number === season) || availableSeasons[0];
  const episodes = pickedSeason ? Array.from({ length: pickedSeason.episodes }, (_, i) => i + 1).filter((e) => available(project, pickedSeason, e)) : [];
  async function start() {
    if (!project) return;
    await a.run(async () => {
      if (!active) {
        await f.mutate("session", crypto.randomUUID(), { project_id: project.id, ...(project.type === "series" ? { season: pickedSeason?.number, episode } : {}) });
      }
      setChoosing(false);
      location.hash = active ? "/sessions/" + active.id : "/sessions/live";
    });
  }
  return <div className="start-together">
    <button className="primary start-together-button" disabled={a.busy || f.offline || !released(project)} onClick={() => { if (active || project.type !== "series") void start(); else { setSeason(availableSeasons[0]?.number || 0); setEpisode(1); setChoosing(true); } }}><Play size={19} fill="currentColor" />{a.busy ? "Готовим наш вечер…" : active ? "Открыть текущий просмотр" : "Начать просмотр вместе"}</button>
    {f.offline && <small>Для начала просмотра нужно подключение.</small>}
    <Feedback text={a.feedback} />
    {choosing && <Sheet title="Выберем серию" close={() => setChoosing(false)}><div className="session-episode-picker"><h3>{project.title}</h3><label>Сезон<select aria-label="Сезон для просмотра" value={pickedSeason?.number || ""} onChange={(e) => { setSeason(Number(e.target.value)); setEpisode(1); }}>{availableSeasons.map((s) => <option key={s.number} value={s.number}>Сезон {s.number}</option>)}</select></label><label>Серия<select aria-label="Серия для просмотра" value={episode} onChange={(e) => setEpisode(Number(e.target.value))}>{episodes.map((e) => <option key={e} value={e}>Серия {e}</option>)}</select></label><button className="primary" disabled={a.busy || f.offline || !episodes.includes(episode)} onClick={() => void start()}><Play size={18} />Начать просмотр вместе</button><Feedback text={a.feedback} /></div></Sheet>}
  </div>;
}

export function ActiveSessionCard() {
  const f = useFamily();
  const session = f.snapshot.sessions.find((s) => s.status === "active");
  if (!session || !f.familyId || f.localMode) return null;
  const project = catalog.find((p) => p.id === session.project_id);
  if (!project) return null;
  return <section className="active-viewing-card" aria-label="Текущий совместный просмотр">
    <img src={import.meta.env.BASE_URL + project.poster} alt="" />
    <div><div className="eyebrow"><span className="red-dot" />СЕЙЧАС СМОТРИМ</div><h2>{project.title}</h2><p>{episodeLabel(session) || "Наш вечер уже начался"}{session.film_minute > 0 ? ` · ${session.film_minute}-я минута` : ""}</p><div className="session-people">{session.participants.map((id) => <Person key={id} id={id} />)}</div><button className="primary" onClick={() => (location.hash = "/sessions/" + session.id)}><Play size={17} />Открыть просмотр</button></div>
  </section>;
}

export function ProjectFamilyTools({ projectId }: { projectId: string }) {
  const f = useFamily();
  const [chat, setChat] = useState(false);
  if (!f.familyId || f.localMode) return null;
  return <section className="project-family-tools"><h3>Наша история этого просмотра</h3><button className="wide-button" onClick={() => (location.hash = "/events/new-" + projectId)}>Назначить киновечер</button><SeasonRatings projectId={projectId} /><button className="wide-button" onClick={() => setChat(!chat)}>Наши комментарии ({f.snapshot.messages.filter((m) => m.scope === "project" && m.target === projectId).length})</button>{chat && <Chat scope="project" target={projectId} title="Обсудим эту историю" />}</section>;
}

function EpisodeWatch({ session }: { session: ViewingSession }) {
  const f = useFamily(), a = useAction();
  const episode = f.snapshot.episodes.find((e) => e.project_id === session.project_id && e.season === session.season && e.episode === session.episode);
  const pending = f.snapshot.watchRequests.find((r) => r.project_id === session.project_id && r.season === session.season && r.episode === session.episode && r.status === "pending");
  const mine = pending?.requested_by === f.user?.id;
  const change = (watched: boolean) => f.mutate("episode", session.project_id, { season: session.season, episode: session.episode, watched }, episode?.version || 0);
  return <div className="session-episode-watch"><h3>{episodeLabel(session)}</h3>{pending ? mine ? <><p>Ждём подтверждения от {f.role === "anton" ? "Тани" : "Антона"}.</p><button className="wide-button" disabled={a.busy} onClick={() => void a.run(() => change(false))}>Отменить отметку серии</button></> : <div className="watch-confirm-actions"><button className="primary" disabled={a.busy || f.offline} onClick={() => void a.run(() => f.mutate("watch_confirm", pending.id, {}, pending.version))}>Да, посмотрели серию</button><button className="wide-button" disabled={a.busy || f.offline} onClick={() => void a.run(() => f.mutate("watch_reject", pending.id, {}, pending.version))}>Ещё смотрим</button></div> : <button className="primary" disabled={a.busy} onClick={() => void a.run(() => change(!episode?.watched))}><CheckCheck size={18} />{episode?.watched ? "Серия просмотрена · отменить" : "Отметить серию просмотренной"}</button>}<Feedback text={a.feedback} /></div>;
}

export function Sessions({ initialId, onRate }: { initialId?: string; onRate: (projectId: string) => void }) {
  const f = useFamily(), a = useAction();
  const [selected, setSelected] = useState(initialId || ""), [minute, setMinute] = useState("");
  const [picker, setPicker] = useState(false), [query, setQuery] = useState("");
  useEffect(() => { setSelected(initialId || ""); }, [initialId]);
  const active = f.snapshot.sessions.find((s) => s.status === "active");
  const session = selected === "live" ? active : f.snapshot.sessions.find((s) => s.id === selected);
  useEffect(() => { if (selected === "live" && active) { setSelected(active.id); history.replaceState(null, "", "#/sessions/" + active.id); } }, [selected, active?.id]);
  const project = session && catalog.find((p) => p.id === session.project_id);
  const previous = f.snapshot.sessions.filter((s) => s.status === "finished").sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (!session || !project) {
    const normalized = query.toLocaleLowerCase("ru").replace(/ё/g, "е").trim();
    const choices = catalog.filter((p) => released(p) && (!normalized || `${p.title} ${p.original}`.toLocaleLowerCase("ru").replace(/ё/g, "е").includes(normalized)));
    return <div className="together-home"><div className="page-heading"><div className="eyebrow">НАШ ВЕЧЕР ПЕРЕД ТЕЛЕВИЗОРОМ</div><h1>Смотрим вместе</h1><p>Выберем историю. А впечатления сохраним здесь.</p></div><ActiveSessionCard />
      {!active && <button className="primary choose-session-film" onClick={() => setPicker(!picker)}><Film size={23} />Выбрать фильм</button>}
      {picker && !active && <section className="session-catalog-picker" aria-label="Выбор фильма"><label className="session-search"><Search size={19} /><input type="search" aria-label="Поиск фильма для просмотра" placeholder="Название фильма или сериала" value={query} onChange={(e) => setQuery(e.target.value)} /></label><div className="session-search-results">{choices.map((p) => <article className="session-search-choice" key={p.id}><img src={import.meta.env.BASE_URL + p.poster} alt="" loading="lazy" /><div><h3>{p.title}</h3><small>{p.year} · {p.type === "series" ? "Сериал" : p.type === "special" ? "Спецвыпуск" : "Фильм"}</small><StartTogether projectId={p.id} /></div></article>)}</div>{!choices.length && <p className="muted">Ничего не нашли. Попробуйте другое название.</p>}</section>}
      <section className="session-history"><h2>Наши прошлые вечера</h2>{previous.length ? <div className="sessions-list">{previous.map((s) => <button className="session-tile" key={s.id} onClick={() => { setSelected(s.id); location.hash = "/sessions/" + s.id; }}><Play size={22} /><div><h3>{catalog.find((p) => p.id === s.project_id)?.title}</h3><small>{episodeLabel(s)}{s.season ? " · " : ""}{displayDate(s.finished_at || s.created_at)}</small></div><ChevronRight size={18} /></button>)}</div> : <div className="empty session-history-empty"><Heart size={25} /><p>Здесь останется история наших вечеров.</p></div>}</section></div>;
  }
  const isActive = session.status === "active";
  const sessionMessageIds = new Set(f.snapshot.messages.filter((m) => m.scope === "session" && m.target === session.id && !m.deleted_at).map((m) => m.id));
  const photos = [...new Map([...mediaForTarget(f.snapshot, "session", session.id), ...[...sessionMessageIds].flatMap(id => mediaForTarget(f.snapshot, "message", id))].map((m) => [m.id, m])).values()];
  return <div className={"viewing-session session-v21 " + (isActive ? "session-is-active" : "session-is-finished")}>
    <div className="session-topline"><button className="text-button" onClick={() => { setSelected(""); location.hash = "/sessions"; }}><ArrowLeft size={16} />Все просмотры</button>{isActive && <button className="text-button session-finish" disabled={a.busy || f.offline} onClick={() => void a.run(() => f.mutate("session", session.id, { status: "finished" }, session.version))}><CheckCheck size={17} />Завершить просмотр</button>}</div>
    <header className="session-hero session-hero-compact"><img src={import.meta.env.BASE_URL + project.poster} alt="" /><div><div className="eyebrow">{isActive && <span className="red-dot" />}{isActive ? "Смотрим сейчас" : "НАШ ВЕЧЕР"}</div><h1>{project.title}</h1>{episodeLabel(session) && <p>{episodeLabel(session)}</p>}<div className="session-people">{session.participants.map((id) => <Person key={id} id={id} />)}</div>{isActive && !session.participants.includes(f.user!.id) && <button className="primary" disabled={a.busy || f.offline} onClick={() => void a.run(() => f.mutate("session", session.id, {}, session.version))}><Users size={16} />Я тоже здесь ❤️</button>}</div></header>
    {isActive ? <><div className="session-live-tools"><Reactions kind="session" id={session.id} /><details className="session-minute"><summary><Clock3 size={16} />{session.film_minute > 0 ? `${session.film_minute}-я минута` : "Указать минуту"}</summary><form onSubmit={(e) => { e.preventDefault(); void a.run(async () => { await f.mutate("session", session.id, { film_minute: Number(minute) }, session.version); setMinute(""); }); }}><input type="number" inputMode="numeric" min="0" max="1440" aria-label="Минута фильма" placeholder="Минута" value={minute} onChange={(e) => setMinute(e.target.value)} /><button className="primary" disabled={a.busy || !minute || f.offline}>Отметить</button></form></details></div><Feedback text={a.feedback} /><Chat embedded scope="session" target={session.id} title="Переписка во время просмотра" /></> : <><section className="session-summary panel"><div className="session-summary-heart">♡</div><h2>Ещё один вечер в нашей вселенной ❤️</h2><p>Сохраним то, что хочется вспомнить.</p><div className="session-summary-step"><span>01</span><div><h3>Посмотрели до конца?</h3>{project.type !== "series" ? <WatchControls project={project} done={!!f.records[project.id]?.watched} className="primary" /> : session.season && session.episode ? <EpisodeWatch session={session} /> : <button className="wide-button" onClick={() => onRate(project.id)}>Выбрать просмотренные серии</button>}<small>Отметка появится после вашего решения. Завершение сеанса само её не ставит.</small></div></div><div className="session-summary-step"><span>02</span><div><SeasonRatings projectId={project.id} /></div></div><div className="session-summary-step"><span>03</span><div><h3>Наши фотографии вечера</h3>{photos.length ? <><div className="session-photo-grid">{photos.map((m) => <PrivatePhoto key={m.id} media={m} />)}</div><SaveToMoments media={photos} projectId={project.id} sessionId={session.id} caption={project.title + " — наш вечер ❤️"} /></> : <p className="muted">Добавьте фото кнопкой камеры в переписке — оно останется частью этого вечера.</p>}</div></div></section><Chat embedded scope="session" target={session.id} title="Впечатления после титров" /><Feedback text={a.feedback} /></>}
  </div>;
}
