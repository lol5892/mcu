import { APP_VERSION } from "./pwa/version";
import { useEffect, useRef, useState } from "react";
import {
  Home,
  Clapperboard,
  Heart,
  ChartNoAxesCombined,
  Settings,
  Search,
  ChevronRight,
  Play,
  Check,
  Star,
  X,
  ArrowUpDown,
  Shuffle,
  Download,
  Upload,
  WifiOff,
  ShieldCheck,
  CalendarDays,
  ArrowUpRight,
  Film,
  Tv,
  Clock3,
  Plus,
  RotateCcw,
  ChevronDown,
  BookOpen,
  CheckCheck,
} from "lucide-react";
import {
  catalog,
  emptyEntry,
  watched,
  progress,
  average,
  markAll,
  toggleEpisode,
  selectProjects,
  nextRecommendation,
  stats,
  sectionNames,
  typeNames,
  episodeKey,
  available,
  today,
  validateBackup,
  type Entry,
  type Records,
  type Project,
  type Filters,
  type Section,
} from "./model";
import {
  readRecords,
  saveEntry,
  mergeRecords,
  clearRecords,
  backup,
} from "./db";
import { useFamily } from "./family/FamilyProvider";
import { WatchControls, WatchInbox } from "./family/WatchConfirmation";
import { Universe, FamilyHomeCards, useFamilyRoute } from "./family/Universe";
import { ProjectFamilyTools, StartTogether, ActiveSessionCard } from "./family/Sessions";
import { Sparkles } from "lucide-react";
type Tab = "home" | "catalog" | "saved" | "stats" | "settings" | "universe";
const nav = [
  { id: "home", label: "Главная", icon: Home },
  { id: "catalog", label: "Каталог", icon: Clapperboard },
  { id: "saved", label: "Наше", icon: Heart },
  { id: "stats", label: "Статистика", icon: ChartNoAxesCombined },
  { id: "universe", label: "Вселенная", icon: Sparkles },
  { id: "settings", label: "Настройки", icon: Settings },
] as const;
const base = import.meta.env.BASE_URL;
const plural = (n: number, one: string, few: string, many: string) =>
  n % 10 === 1 && n % 100 !== 11
    ? one
    : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)
      ? few
      : many;
const dateLabel = (date: string) =>
  date
    ? new Date(date + "T12:00:00").toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "Не указана";
function Cover({ p, className = "" }: { p: Project; className?: string }) {
  return (
    <img
      className={className}
      src={base + p.poster}
      alt={`Авторская обложка: ${p.title}`}
      loading="lazy"
      onError={(e) => {
        e.currentTarget.style.visibility = "hidden";
      }}
    />
  );
}
function Bar({ value }: { value: number }) {
  return (
    <div
      className="progress-track"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div style={{ width: `${value}%` }} />
    </div>
  );
}
export default function App() {
  const family = useFamily();
  const cloudActive = Boolean(
    family.user && family.familyId && !family.localMode,
  );
  const familyRoute = useFamilyRoute();
  const [tab, setTab] = useState<Tab>("home"),
    [records, setRecords] = useState<Records>({}),
    [loaded, setLoaded] = useState(false),
    [loadError, setLoadError] = useState(false),
    [selected, setSelected] = useState<Project | null>(null);
  const ref = useRef<Records>({});
  const queue = useRef(Promise.resolve());
  const [saveStatus, setSaveStatus] = useState("Сохранено на устройстве"),
    [saveError, setSaveError] = useState(false),
    [notice, setNotice] = useState("");
  const [offline, setOffline] = useState(!navigator.onLine),
    [offlineReady, setOfflineReady] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    query: "",
    section: "main",
    type: "all",
    status: "all",
    phase: "all",
    sort: "release",
  });
  const [savedMode, setSavedMode] = useState("favorites"),
    [pendingImport, setPendingImport] = useState<Records | null>(null),
    [reset, setReset] = useState(false),
    [resetText, setResetText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (cloudActive) {
      ref.current = family.records;
      setRecords(family.records);
      setLoaded(true);
    } else
      readRecords()
        .then((r) => {
          ref.current = r;
          setRecords(r);
          setLoaded(true);
        })
        .catch(() => setLoadError(true));
    const online = () => setOffline(!navigator.onLine);
    const swError = () =>
      setNotice("Офлайн-кеш недоступен. Откройте сайт с интернетом повторно.");
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    window.addEventListener("sw-error", swError);
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.ready.then(() => setOfflineReady(true));
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
      window.removeEventListener("sw-error", swError);
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(t);
  }, [notice]);
  function change(id: string, next: Entry) {
    if (!loaded) return;
    if (cloudActive) {
      setSaveError(false);
      setSaveStatus(
        family.offline
          ? "Сохранено в очереди на устройстве"
          : "Синхронизируем…",
      );
      queue.current = queue.current
        .catch(() => {})
        .then(() => family.changeEntry(id, next))
        .then(() =>
          setSaveStatus(
            family.offline
              ? "В очереди · отправим после подключения"
              : "Изменение сохранено · статус в синхронизации",
          ),
        )
        .catch((e) => {
          setSaveError(true);
          setSaveStatus(
            e instanceof Error ? e.message : "Не удалось синхронизировать",
          );
        });
      return;
    }
    const all = {
      ...ref.current,
      [id]: { ...next, updatedAt: new Date().toISOString() },
    };
    ref.current = all;
    setRecords(all);
    setSaveStatus("Сохраняем…");
    queue.current = queue.current
      .catch(() => {})
      .then(() => saveEntry(id, all[id]))
      .then(() => {
        setSaveStatus("Сохранено на устройстве");
      })
      .catch(() => {
        setSaveError(true);
        setSaveStatus("Ошибка сохранения — экспортируйте копию");
      });
  }
  useEffect(() => {
    if (cloudActive) {
      ref.current = family.records;
      setRecords(family.records);
    }
  }, [family.snapshot, cloudActive]);
  useEffect(() => {
    if (
      cloudActive &&
      [
        "universe",
        "letters",
        "chat",
        "project",
        "moments",
        "events",
        "sessions",
        "settings",
        "preferences",
        "backup",
        "sync",
      ].includes(familyRoute.page)
    ) {
      setTab("universe");
      setSelected(null);
    }
  }, [familyRoute.page, familyRoute.id, cloudActive]);
  function go(t: Tab) {
    setTab(t);
    if (t === "universe") location.hash = "/universe";
    else if (location.hash.startsWith("#/")) location.hash = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  const allStats = stats(records);
  const list = selectProjects(records, filters);
  const recommendation = nextRecommendation(records, filters);
  const next = recommendation?.project;
  function random() {
    const candidates = list.filter(
      (p) => !watched(p, records[p.id]) && p.section !== "future",
    );
    if (!candidates.length) {
      setNotice("В этом списке всё просмотрено! Измените фильтры.");
      return;
    }
    setSelected(candidates[Math.floor(Math.random() * candidates.length)]);
  }
  function exportData() {
    const blob = new Blob([JSON.stringify(backup(ref.current), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `our-marvel-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  async function importFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw Error("Файл больше 5 МБ.");
      setPendingImport(validateBackup(JSON.parse(await file.text())));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Не удалось прочитать файл.");
    }
    if (inputRef.current) inputRef.current.value = "";
  }
  async function confirmImport() {
    if (!pendingImport) return;
    try {
      await queue.current;
      await mergeRecords(pendingImport);
      const all = { ...ref.current, ...pendingImport };
      ref.current = all;
      setRecords(all);
      setPendingImport(null);
      setNotice("Копия импортирована. Записи объединены.");
    } catch {
      setNotice("Импорт не сохранён. Попробуйте ещё раз.");
    }
  }
  async function confirmReset() {
    if (resetText !== "СБРОСИТЬ") return;
    try {
      await queue.current;
      await clearRecords();
      ref.current = {};
      setRecords({});
      setReset(false);
      setResetText("");
      setNotice("Личный список очищен.");
    } catch {
      setNotice("Не удалось очистить данные.");
    }
  }
  if (loadError)
    return (
      <main className="loading">
        <ShieldCheck size={40} />
        <h1>Хранилище недоступно</h1>
        <p>
          Разрешите хранение данных в браузере и перезагрузите страницу. Текущие
          данные не перезаписаны.
        </p>
        <button onClick={() => location.reload()}>Повторить</button>
      </main>
    );
  if (!loaded)
    return (
      <main className="loading">
        <div className="brand">
          НАШ <b>MARVEL</b>
        </div>
        <p>Открываем нашу вселенную…</p>
      </main>
    );
  const savedProjects = catalog
    .filter((p) =>
      savedMode === "favorites"
        ? records[p.id]?.favorite
        : savedMode === "top"
          ? watched(p, records[p.id]) && average(records[p.id]) !== null
          : watched(p, records[p.id]),
    )
    .sort((a, b) =>
      savedMode === "top"
        ? (average(records[b.id]) ?? 0) - (average(records[a.id]) ?? 0)
        : (records[b.id]?.date || "").localeCompare(records[a.id]?.date || ""),
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go("home");
          }}
          className="brand"
        >
          НАШ <b>MARVEL</b>
        </a>
        <p className="sidebar-caption">НАША КИНОВСЕЛЕННАЯ</p>
        <nav>
          {nav.map((n) => (
            <button
              key={n.id}
              className={tab === n.id ? "active" : ""}
              onClick={() => go(n.id)}
            >
              <n.icon size={20} />
              {n.label}
              {tab === n.id && <i />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="avatars">
            <span>А</span>
            <span>Т</span>
          </div>
          <div>
            <strong>Антон и Таня</strong>
            <small>Одна вселенная на двоих</small>
          </div>
          <Heart size={15} />
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="mobile-brand brand">
            НАШ <b>MARVEL</b>
          </div>
          <div className="breadcrumb">
            НАША КОЛЛЕКЦИЯ <span>/</span> {nav.find((n) => n.id === tab)?.label}
          </div>
          <div className="top-right">
            <span className="storage">
              <i className={offline ? "amber" : ""} />
              {offline ? "Без интернета" : "Личный кинодневник"}
            </span>
            <div className="avatars">
              <span>А</span>
              <span>Т</span>
            </div>
          </div>
        </header>
        {offline && (
          <div className="offline-banner">
            <WifiOff size={15} /> Офлайн. Ваши отметки сохраняются на этом
            устройстве.
          </div>
        )}
        {saveError && (
          <div role="alert" className="error-banner">
            {saveStatus}
            <button onClick={exportData}>Экспорт копии</button>
          </div>
        )}
        <WatchInbox
          hidden={Boolean(selected)}
          onProject={(id) =>
            setSelected(catalog.find((p) => p.id === id) || null)
          }
          onNotice={setNotice}
        />
        <main>
          {tab === "universe" && (
            <Universe
              onProject={(id) =>
                setSelected(catalog.find((p) => p.id === id) || null)
              }
            />
          )}
          {tab === "home" && (
            <>
              <section className="intro">
                <div>
                  <div className="eyebrow">
                    <span /> НАШ МАЛЕНЬКИЙ КИНОРИТУАЛ
                  </div>
                  <h1>
                    Большая вселенная.
                    <br />
                    <span>Наша история.</span>
                  </h1>
                  <p>
                    {cloudActive
                      ? "Наша маленькая вселенная"
                      : "Смотрим вселенную вместе."}
                  </p>
                </div>
                <div className="edition">
                  THE MARVEL JOURNEY <span>2008 — 2026</span>
                </div>
              </section>
              <FamilyHomeCards />
              {cloudActive && <ActiveSessionCard />}
              <section
                className="family-stats"
                aria-label="Семейная статистика"
              >
                <div
                  className="progress-ring"
                  style={
                    { "--p": `${allStats.percent}%` } as React.CSSProperties
                  }
                >
                  <div>
                    <strong>
                      {allStats.percent}
                      <em>%</em>
                    </strong>
                    <small>вселенной</small>
                  </div>
                </div>
                <div className="stats-body">
                  <div className="stats-title">
                    <span>Наш путь по Marvel</span>
                    <span className="tiny-tag">АНТОН + ТАНЯ</span>
                  </div>
                  <div className="stat-numbers">
                    <div>
                      <strong>
                        {allStats.done}
                        <small> / {allStats.total}</small>
                      </strong>
                      <span>Просмотрено</span>
                    </div>
                    <div>
                      <strong>{allStats.left}</strong>
                      <span>Ещё впереди</span>
                    </div>
                    <div>
                      <strong className="gold">
                        <Star size={19} fill="currentColor" />
                        {allStats.average?.toFixed(1) || "—"}
                      </strong>
                      <span>Наша оценка</span>
                    </div>
                  </div>
                  <Bar value={allStats.percent} />
                  <small className="stats-foot">
                    {allStats.films}{" "}
                    {plural(allStats.films, "фильм", "фильма", "фильмов")} ·{" "}
                    {allStats.series}{" "}
                    {plural(allStats.series, "сериал", "сериала", "сериалов")}{" "}
                    завершено · Все разделы, без анонсов
                  </small>
                </div>
              </section>
              {next ? (
                <section className="hero" onClick={() => setSelected(next)}>
                  <div className="hero-art">
                    <Cover p={next} />
                    <div className="orb">
                      <div />
                      <span>Μ</span>
                    </div>
                    <div className="art-lines" />
                  </div>
                  <div className="hero-shade" />
                  <div className="hero-content">
                    <div className="eyebrow">
                      <span className="red-dot" /> СЛЕДУЮЩЕЕ К ПРОСМОТРУ
                    </div>
                    <h2>{next.title}</h2>
                    {recommendation?.season && (
                      <span className="hero-season">
                        СЕЗОН {recommendation.season}
                      </span>
                    )}
                    <div className="meta">
                      <span>{next.year}</span>
                      <i />
                      {next.phase && (
                        <>
                          <span>Фаза {next.phase}</span>
                          <i />
                        </>
                      )}
                      <span>{typeNames[next.type]}</span>
                    </div>
                    <p>{next.description}</p>
                    <button
                      className="primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected(next);
                      }}
                    >
                      <Play size={16} fill="currentColor" />
                      Наш следующий вечер
                      <ChevronRight size={18} />
                    </button>
                    <div className="hero-order">
                      {filters.sort === "release"
                        ? "В порядке выхода"
                        : filters.sort === "chronology"
                          ? "В порядке событий"
                          : "В выбранном порядке"}{" "}
                      · {sectionNames[next.section]}
                    </div>
                  </div>
                  <span className="hero-corner">ВМЕСТЕ ЛУЧШЕ</span>
                </section>
              ) : (
                <div className="empty">
                  <CheckCheck />
                  <h2>Этот список пройден!</h2>
                  <p>Самое время выбрать другую вселенную.</p>
                </div>
              )}
              <div className="section-heading">
                <div>
                  <div className="eyebrow">
                    ОДИН ФИЛЬМ — ЕЩЁ ОДНО ВОСПОМИНАНИЕ
                  </div>
                  <h2>
                    Наша коллекция <span>{list.length}</span>
                  </h2>
                </div>
                <button
                  className="text-button"
                  aria-label="Выбрать случайно"
                  onClick={random}
                >
                  <Shuffle size={17} />
                  <span>Выбрать случайно</span>
                </button>
              </div>
            </>
          )}
          {tab === "catalog" && (
            <div className="page-heading">
              <div className="eyebrow">ВСЁ НАЧАЛОСЬ С ОДНОГО КОСТЮМА</div>
              <h1>Каталог вселенной</h1>
              <p>Истории, которые хочется смотреть вместе.</p>
            </div>
          )}
          {(tab === "home" || tab === "catalog") && (
            <>
              <div className="collection-controls">
                <div
                  className="section-pills"
                  role="group"
                  aria-label="Раздел каталога"
                >
                  {(
                    [
                      "main",
                      "defenders",
                      "related",
                      "animation",
                      "all",
                      "future",
                    ] as const
                  ).map((s) => (
                    <button
                      key={s}
                      className={filters.section === s ? "selected" : ""}
                      onClick={() => setFilters({ ...filters, section: s })}
                    >
                      {s === "all" ? "Все разделы" : sectionNames[s]}
                    </button>
                  ))}
                </div>
                <div className="filter-row">
                  <label className="search">
                    <Search size={18} />
                    <input
                      aria-label="Поиск"
                      placeholder="Найти нашу следующую историю…"
                      value={filters.query}
                      onChange={(e) =>
                        setFilters({ ...filters, query: e.target.value })
                      }
                    />
                    {filters.query && (
                      <button
                        aria-label="Очистить поиск"
                        onClick={() => setFilters({ ...filters, query: "" })}
                      >
                        <X size={16} />
                      </button>
                    )}
                  </label>
                  <label className="sort-select">
                    <ArrowUpDown size={16} />
                    <select
                      aria-label="Сортировка"
                      value={filters.sort}
                      onChange={(e) =>
                        setFilters({ ...filters, sort: e.target.value })
                      }
                    >
                      <option value="release">По дате выхода</option>
                      <option value="chronology">По событиям</option>
                      <option value="phase">По фазам</option>
                      <option value="rating">По нашей оценке</option>
                      <option value="year">По году: новые</option>
                    </select>
                  </label>
                </div>
                <div className="filter-subrow">
                  <div className="type-tabs">
                    {[
                      ["all", "Всё"],
                      ["film", "Фильмы"],
                      ["series", "Сериалы"],
                      ["special", "Спецвыпуски"],
                    ].map(([v, t]) => (
                      <button
                        key={v}
                        className={filters.type === v ? "active" : ""}
                        onClick={() => setFilters({ ...filters, type: v })}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <div className="dropdowns">
                    <select
                      aria-label="Статус просмотра"
                      value={filters.status}
                      onChange={(e) =>
                        setFilters({ ...filters, status: e.target.value })
                      }
                    >
                      <option value="all">Любой статус</option>
                      <option value="unwatched">Непросмотренное</option>
                      <option value="watched">Просмотренное</option>
                      <option value="favorite">Избранное</option>
                    </select>
                    <select
                      aria-label="Фаза"
                      value={filters.phase}
                      onChange={(e) =>
                        setFilters({ ...filters, phase: e.target.value })
                      }
                    >
                      <option value="all">Все фазы</option>
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <option key={n} value={n}>
                          Фаза {n}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              {filters.section === "related" && (
                <p className="context-note">
                  <BookOpen size={18} /> Связанные проекты Marvel Television.
                  Канонический статус неоднозначен; «Хелстром» не относится к
                  подтверждённому MCU.
                </p>
              )}
              {filters.section === "animation" && (
                <p className="context-note">
                  <BookOpen size={18} /> Альтернативные анимационные вселенные.
                  «Что, если…?» и «Зомби Marvel» связаны с мультивселенной MCU;
                  «Люди Икс ’97» — отдельная история.
                </p>
              )}
              {filters.sort === "chronology" && (
                <p className="context-note">
                  Порядок основных событий — ориентир без сцен после титров.
                  Сезоны показаны внутри сериала; истории без надёжного общего
                  места находятся в конце с пометкой «Вне общей хронологии».
                </p>
              )}
              <div className="results-label">
                <span>
                  {list.length} проектов <i>·</i>{" "}
                  {filters.section === "all"
                    ? "Все разделы"
                    : sectionNames[filters.section]}
                </span>
                <span>КАТАЛОГ · 08.11.2026</span>
              </div>
              <div className="project-grid">
                {(tab === "home" ? list.slice(0, 12) : list).map((p, i) => (
                  <Card
                    key={p.id}
                    p={p}
                    r={records[p.id]}
                    index={i + 1}
                    open={() => setSelected(p)}
                    change={(r) => change(p.id, r)}
                    chronology={filters.sort === "chronology"}
                  />
                ))}
              </div>
              {!list.length && (
                <div className="empty">
                  <Search />
                  <h2>История пока не найдена</h2>
                  <p>Попробуйте другое название или сбросьте фильтры.</p>
                  <button
                    onClick={() =>
                      setFilters({
                        query: "",
                        section: "all",
                        type: "all",
                        status: "all",
                        phase: "all",
                        sort: "release",
                      })
                    }
                  >
                    Сбросить фильтры
                  </button>
                </div>
              )}
              {tab === "home" && list.length > 12 && (
                <button className="load-more" onClick={() => go("catalog")}>
                  Открыть всю коллекцию <ChevronRight size={17} />
                </button>
              )}
            </>
          )}
          {tab === "saved" && (
            <>
              <div className="page-heading">
                <div className="eyebrow">ОСТАЁТСЯ МЕЖДУ НАМИ</div>
                <h1>Наши истории</h1>
                <p>Любимое, лучшие вечера и маленькие заметки.</p>
              </div>
              <div className="section-pills personal-tabs">
                {[
                  ["favorites", "Избранное"],
                  ["top", "Наш топ-10"],
                  ["history", "История просмотров"],
                ].map(([v, t]) => (
                  <button
                    key={v}
                    className={savedMode === v ? "selected" : ""}
                    onClick={() => setSavedMode(v)}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {!savedProjects.length ? (
                <div className="empty">
                  <Heart />
                  <h2>Здесь будут наши воспоминания</h2>
                  <p>
                    Добавьте историю в избранное или посмотрите и оцените её
                    вдвоём.
                  </p>
                  <button onClick={() => go("catalog")}>Выбрать историю</button>
                </div>
              ) : (
                <div className="project-grid">
                  {(savedMode === "top"
                    ? savedProjects.slice(0, 10)
                    : savedProjects
                  ).map((p, i) => (
                    <div key={p.id}>
                      {savedMode === "top" && (
                        <div className="rank">#{i + 1} В НАШЕМ ТОПЕ</div>
                      )}
                      {savedMode === "history" && (
                        <div className="history-date">
                          <CalendarDays size={14} />
                          {dateLabel(records[p.id].date)}
                        </div>
                      )}
                      <Card
                        p={p}
                        r={records[p.id]}
                        index={i + 1}
                        open={() => setSelected(p)}
                        change={(r) => change(p.id, r)}
                      />
                      {records[p.id]?.note && (
                        <p className="note-preview">«{records[p.id].note}»</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {tab === "stats" && (
            <>
              <div className="page-heading">
                <div className="eyebrow">КАЖДЫЙ ВЕЧЕР ИМЕЕТ ЗНАЧЕНИЕ</div>
                <h1>Наша статистика</h1>
                <p>Вся вселенная в цифрах. И немного нашей любви к кино.</p>
              </div>
              <div className="stats-grid">
                <section className="panel big-stat">
                  <h2>Вселенная становится ближе</h2>
                  <div
                    className="progress-ring large"
                    style={
                      { "--p": `${allStats.percent}%` } as React.CSSProperties
                    }
                  >
                    <div>
                      <strong>
                        {allStats.percent}
                        <em>%</em>
                      </strong>
                      <small>
                        {allStats.done} из {allStats.total} историй
                      </small>
                    </div>
                  </div>
                  <p>{allStats.left} новых историй впереди</p>
                  <div className="stat-summary">
                    <span>
                      <Film size={18} />
                      {allStats.films}{" "}
                      {plural(allStats.films, "фильм", "фильма", "фильмов")}
                    </span>
                    <span>
                      <Tv size={18} />
                      {allStats.series}{" "}
                      {plural(allStats.series, "сериал", "сериала", "сериалов")}
                    </span>
                    <span>
                      <Play size={16} />
                      {allStats.episodes}{" "}
                      {plural(allStats.episodes, "серия", "серии", "серий")}
                    </span>
                  </div>
                </section>
                <section className="panel">
                  <div className="eyebrow">САГА ЗА САГОЙ</div>
                  <h2>Наш прогресс по фазам</h2>
                  {[1, 2, 3, 4, 5, 6].map((phase) => {
                    const ps = catalog.filter(
                      (p) =>
                        p.section === "main" &&
                        (p.phase === phase ||
                          p.seasons.some((s) => s.phase === phase)),
                    );
                    const s = stats(records, ps);
                    return (
                      <div className="phase-row" key={phase}>
                        <div>
                          <span>Фаза {phase}</span>
                          <small>
                            {s.done} / {s.total} проектов
                          </small>
                        </div>
                        <Bar value={s.percent} />
                      </div>
                    );
                  })}
                  <small className="muted">
                    Сериал с сезонами разных фаз учитывается в каждой
                    соответствующей фазе.
                  </small>
                </section>
                <section className="panel">
                  <div className="eyebrow">НА ОДНОЙ ВОЛНЕ</div>
                  <h2>Наши оценки</h2>
                  <div className="rating-comparison">
                    {(["anton", "tanya"] as const).map((who, i) => {
                      const ratings = catalog
                        .filter((p) => watched(p, records[p.id]))
                        .map((p) => records[p.id]?.[who])
                        .filter((n): n is number => n != null);
                      const avg = ratings.length
                        ? ratings.reduce((a, b) => a + b, 0) / ratings.length
                        : 0;
                      return (
                        <div key={who}>
                          <div className={"avatar " + who}>
                            {i === 0 ? "А" : "Т"}
                          </div>
                          <strong>
                            {ratings.length ? avg.toFixed(1) : "—"}
                          </strong>
                          <span>{i === 0 ? "Антон" : "Таня"}</span>
                          <small>{ratings.length} оценок</small>
                          <Bar value={avg * 10} />
                        </div>
                      );
                    })}
                  </div>
                  <p className="context-note">
                    Средняя пары появляется, когда оценили оба. Общая средняя —
                    по завершённым проектам с двумя оценками.
                  </p>
                </section>
                <section className="panel">
                  <div className="eyebrow">МУЛЬТИВСЕЛЕННАЯ НАШИХ ВЕЧЕРОВ</div>
                  <h2>По разделам</h2>
                  {(
                    ["main", "defenders", "related", "animation"] as Section[]
                  ).map((section) => {
                    const s = stats(
                      records,
                      catalog.filter((p) => p.section === section),
                    );
                    return (
                      <div className="phase-row" key={section}>
                        <div>
                          <span>{sectionNames[section]}</span>
                          <small>
                            {s.percent}% · {s.done}/{s.total}
                          </small>
                        </div>
                        <Bar value={s.percent} />
                      </div>
                    );
                  })}
                  <div className="gold-summary">
                    <Star fill="currentColor" size={25} />
                    <strong>{allStats.average?.toFixed(1) || "—"}</strong>
                    <span>Средняя наша оценка</span>
                  </div>
                </section>
              </div>
            </>
          )}
          {tab === "settings" && <p className="muted" aria-label="Версия приложения">Наш Marvel {APP_VERSION} · обновляется автоматически, когда вы не заняты</p>}
          {tab === "settings" && cloudActive && (
            <section className="panel">
              <h1>Наше пространство</h1>
              <p>
                Данные синхронизируются через приватное семейное пространство.
                Локальная база первой версии остаётся на устройстве.
              </p>
              <button
                className="wide-button"
                onClick={() => (location.hash = "/preferences")}
              >
                Наши профили и приглашение
              </button>
              <button
                className="wide-button"
                onClick={() => (location.hash = "/settings/notifications")}
              >
                Уведомления на двух iPhone
              </button>
              <button
                className="wide-button"
                onClick={() => (location.hash = "/backup")}
              >
                Перенос, резервные копии и удаление данных
              </button>
              <button
                className="wide-button"
                onClick={() => (location.hash = "/sync")}
              >
                Очередь синхронизации ({family.operations.length})
              </button>
              <p>
                Установка: Safari → Поделиться → На экран Домой. Для Web Push на
                iPhone нужен iOS 16.4+ и запуск с иконки.
              </p>
              <div className="status-chip">
                <ShieldCheck size={17} />
                {offlineReady
                  ? "Офлайн-кеш готов"
                  : "Офлайн-кеш готовится при HTTPS-запуске"}
              </div>
            </section>
          )}
          {tab === "settings" && !cloudActive && (
            <>
              <div className="page-heading">
                <div className="eyebrow">ВСЁ ПОД КОНТРОЛЕМ</div>
                <h1>Наше пространство</h1>
                <p>Установка, резервные копии и немного о приложении.</p>
              </div>
              <div className="settings-grid">
                <section className="panel">
                  <div className="panel-icon">
                    <Plus />
                  </div>
                  <h2>На главный экран iPhone</h2>
                  <ol className="install-steps">
                    <li>
                      Откройте эту страницу в <strong>Safari</strong>.
                    </li>
                    <li>
                      Нажмите <strong>«Поделиться»</strong> (квадрат со стрелкой
                      вверх).
                    </li>
                    <li>
                      Выберите <strong>«На экран Домой»</strong>, затем
                      «Добавить».
                    </li>
                    <li>
                      Запустите «Наш Marvel» с иконки и дождитесь готовности
                      офлайн-кеша.
                    </li>
                  </ol>
                  <div className="status-chip">
                    <ShieldCheck size={17} />
                    {offlineReady
                      ? "Офлайн-кеш готов"
                      : "Офлайн-кеш готовится при HTTPS-запуске"}
                  </div>
                  <p className="muted">
                    После первого успешного кеширования приложение открывается
                    без интернета. При обновлении закройте все его окна и
                    откройте снова: личные записи остаются в IndexedDB.
                  </p>
                </section>
                <section className="panel">
                  <div className="panel-icon gold">
                    <ShieldCheck />
                  </div>
                  <h2>Наши данные — у нас</h2>
                  <p>
                    Отметки, оценки и заметки автоматически сохраняются в
                    IndexedDB на этом устройстве.
                  </p>
                  <div className="save-indicator">
                    <i />
                    {saveStatus}
                  </div>
                  <button className="wide-button" onClick={exportData}>
                    <Download size={19} />
                    Экспорт резервной копии JSON
                    <ArrowUpRight size={16} />
                  </button>
                  <button
                    className="wide-button"
                    onClick={() => inputRef.current?.click()}
                  >
                    <Upload size={19} />
                    Импорт резервной копии
                    <ChevronRight size={16} />
                  </button>
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".json,application/json"
                    hidden
                    onChange={(e) => importFile(e.target.files?.[0])}
                  />
                  <p className="muted">
                    Safari и установленное приложение могут использовать разные
                    хранилища. Синхронизации между телефонами нет. Для переноса
                    используйте экспорт и импорт. Сохраняйте копии: iOS может
                    очистить данные сайта.
                  </p>
                  <button
                    className="text-button"
                    onClick={() => {
                      navigator.storage
                        ?.persist?.()
                        .then((ok) =>
                          setNotice(
                            ok
                              ? "Постоянное хранение разрешено."
                              : "Браузер сам управляет хранением. Делайте резервные копии.",
                          ),
                        )
                        .catch(() =>
                          setNotice(
                            "Браузер не поддерживает запрос постоянного хранения.",
                          ),
                        );
                    }}
                  >
                    Запросить постоянное хранение
                  </button>
                </section>
                <section className="panel">
                  <div className="panel-icon">
                    <BookOpen />
                  </div>
                  <h2>О каталоге</h2>
                  <p>
                    Срез на 8 ноября 2026 года: 38 вышедших фильмов, сериалы,
                    сюжетные спецвыпуски и Marvel One-Shots. Даты — начало
                    широкого проката в США или первая доступность в стриминге.
                    Локальные даты могут отличаться.
                  </p>
                  <p>
                    Защитники выделены в свою сагу внутри MCU. Связанные сериалы
                    и альтернативная анимация находятся в отдельных разделах.
                    Документальные «Сбор», «Легенды», рекапы и рекламные ролики
                    не включены.
                  </p>
                  <p>
                    Обложки — оригинальные локальные иллюстрации, а не
                    официальные постеры. Проект не связан с Marvel или Disney.
                    Все названия принадлежат правообладателям.
                  </p>
                  <details>
                    <summary>
                      Источники и проверка <ChevronDown size={16} />
                    </summary>
                    <ul className="source-list">
                      <li>
                        <a
                          href="https://www.marvel.com/movies"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Marvel: фильмы
                        </a>
                      </li>
                      <li>
                        <a
                          href="https://www.marvel.com/tv-shows"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Marvel: сериалы
                        </a>
                      </li>
                      <li>
                        <a
                          href="https://www.disneyplus.com/explore/articles/marvel-movies-in-order/"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Disney+: фильмы и фазы
                        </a>
                      </li>
                      <li>
                        <a
                          href="https://www.imdb.com/title/tt23112594/episodes/"
                          target="_blank"
                          rel="noreferrer"
                        >
                          IMDb: эпизоды VisionQuest
                        </a>
                      </li>
                      <li>
                        <a
                          href="https://editorial.rottentomatoes.com/guide/marvel-movies-in-order/"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Rotten Tomatoes: хронология
                        </a>
                      </li>
                    </ul>
                    <p className="muted">
                      Ссылки на конкретные источники также есть в карточках. У
                      первых серий сезона используется дата премьеры сезона,
                      кроме продолжающегося VisionQuest: для него задано
                      расписание каждой серии. Новые проекты добавляются в
                      catalog.json без изменения логики.
                    </p>
                  </details>
                </section>
                <section className="panel danger-panel">
                  <RotateCcw size={25} />
                  <h2>Начать заново</h2>
                  <p>
                    Удалить личные отметки, оценки и заметки. Каталог останется.
                    Сначала сохраните резервную копию.
                  </p>
                  <button
                    className="danger-button"
                    onClick={() => setReset(true)}
                  >
                    Очистить личные данные
                  </button>
                </section>
              </div>
              <p className="version-label">
                НАШ MARVEL · ВЕРСИЯ 1.0 · СОЗДАНО ДЛЯ ДВОИХ
              </p>
            </>
          )}
          <footer>
            <div className="brand">
              НАШ <b>MARVEL</b>
            </div>
            <span>Смотрим вселенную вместе.</span>
            <span>
              <Heart size={12} /> Антон и Таня
            </span>
          </footer>
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Главная навигация">
        {nav.map((n) => (
          <button
            key={n.id}
            className={tab === n.id ? "active" : ""}
            onClick={() => go(n.id)}
          >
            <n.icon size={21} />
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
      {selected && (
        <Detail
          p={selected}
          r={records[selected.id] || emptyEntry()}
          change={(r) => change(selected.id, r)}
          close={() => setSelected(null)}
          saveStatus={saveStatus}
        />
      )}
      {pendingImport && (
        <Dialog
          title="Восстановить нашу историю?"
          close={() => setPendingImport(null)}
        >
          <p>
            В копии {Object.keys(pendingImport).length} записей. Совпадающие
            проекты будут заменены данными копии. Остальные записи останутся.
          </p>
          <button className="wide-button" onClick={exportData}>
            <Download size={18} />
            Сначала сохранить текущую копию
          </button>
          <button className="primary" onClick={confirmImport}>
            Импортировать
          </button>
        </Dialog>
      )}
      {reset && (
        <Dialog
          title="Очистить личный список?"
          close={() => {
            setReset(false);
            setResetText("");
          }}
        >
          <p>
            Это действие удалит ваши оценки и прогресс. Для подтверждения
            введите СБРОСИТЬ.
          </p>
          <input
            className="text-input"
            aria-label="Подтверждение сброса"
            value={resetText}
            onChange={(e) => setResetText(e.target.value)}
            placeholder="СБРОСИТЬ"
          />
          <button
            className="danger-button"
            disabled={resetText !== "СБРОСИТЬ"}
            onClick={confirmReset}
          >
            Удалить данные
          </button>
        </Dialog>
      )}
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button
            aria-label="Закрыть уведомление"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
function Card({
  p,
  r,
  index,
  open,
  change,
  chronology = false,
}: {
  p: Project;
  r?: Entry;
  index: number;
  open: () => void;
  change: (r: Entry) => void;
  chronology?: boolean;
}) {
  const family = useFamily();
  const confirmWatch = Boolean(
    family.familyId &&
    !family.localMode &&
    family.snapshot.family?.watch_confirmation,
  );
  const done = watched(p, r),
    pr = progress(p, r),
    rating = average(r);
  return (
    <article className={"project-card " + (done ? "is-watched" : "")}>
      <div className="poster-wrap">
        <button
          className="poster-button"
          aria-label={`Открыть: ${p.title}`}
          onClick={open}
        >
          <Cover p={p} />
          <span className="poster-overlay" />
          <span className="poster-play">
            <Play fill="currentColor" size={20} />
          </span>
        </button>
        <span className="card-number">{String(index).padStart(2, "0")}</span>
        <button
          className={"favorite-button " + (r?.favorite ? "is-favorite" : "")}
          aria-label={`${r?.favorite ? "Убрать из избранного" : "В избранное"}: ${p.title}`}
          onClick={() =>
            change({ ...(r || emptyEntry()), favorite: !r?.favorite })
          }
        >
          <Heart size={17} fill={r?.favorite ? "currentColor" : "none"} />
        </button>
        <span className="poster-type">
          {p.type === "series" ? (
            <Tv size={11} />
          ) : p.type === "film" ? (
            <Film size={11} />
          ) : (
            <Star size={11} />
          )}{" "}
          {typeNames[p.type]}
        </span>
        {done && (
          <span className="watched-badge">
            <Check size={12} />
            ПРОСМОТРЕНО
          </span>
        )}
      </div>
      <div className="card-copy">
        <div className="card-meta">
          {p.year}
          <i />
          {p.phase
            ? `Фаза ${p.phase}`
            : p.section === "defenders"
              ? "Защитники"
              : "Вне фаз"}
          {rating !== null && (
            <span className="card-rating">
              <Star size={12} fill="currentColor" />
              {rating.toFixed(1)}
            </span>
          )}
        </div>
        <button className="card-title" onClick={open}>
          {p.title}
        </button>
        <p>{p.description}</p>
        {chronology && p.chronology === null && (
          <small className="muted">Вне общей хронологии</small>
        )}
        {p.type === "series" && (
          <div className="episode-mini">
            <span>
              {p.seasonCount}{" "}
              {p.seasonCount === 1
                ? "сезон"
                : p.seasonCount < 5
                  ? "сезона"
                  : "сезонов"}
            </span>
            <span>
              {pr.done}/{pr.total} серий
            </span>
            <Bar value={(pr.done / pr.total) * 100} />
          </div>
        )}
        {confirmWatch && p.type !== "series" ? (
          <WatchControls project={p} done={done} />
        ) : (
          <button
            className={"watch-button " + (done ? "done" : "")}
            disabled={p.section === "future"}
            onClick={() =>
              p.type === "series"
                ? open()
                : change(markAll(p, r || emptyEntry(), !done))
            }
          >
            {done ? (
              <Check size={14} />
            ) : p.type === "series" ? (
              <Play size={13} />
            ) : (
              <Plus size={14} />
            )}{" "}
            {p.section === "future"
              ? "Скоро"
              : done
                ? "Посмотрели"
                : p.type === "series"
                  ? "Отметить серии"
                  : "Посмотрели"}
          </button>
        )}
      </div>
    </article>
  );
}
function Dialog({
  title,
  close,
  children,
  className = "",
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    el.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const focusable = el.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input, select, textarea, a[href], summary",
        );
        if (!focusable?.length) return;
        const first = focusable[0],
          last = focusable[focusable.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === el.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className={"modal " + className}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={el}
      >
        <button className="modal-close" onClick={close} aria-label="Закрыть">
          <X />
        </button>
        {className !== "detail" && <h2>{title}</h2>}
        {children}
      </div>
    </div>
  );
}
function Detail({
  p,
  r,
  change,
  close,
  saveStatus,
}: {
  p: Project;
  r: Entry;
  change: (r: Entry) => void;
  close: () => void;
  saveStatus: string;
}) {
  const family = useFamily();
  const cloudActive = Boolean(
    family.user && family.familyId && !family.localMode,
  );
  const canRate =
    cloudActive && p.type === "series"
      ? progress(p, r).done > 0
      : watched(p, r);
  const done = watched(p, r),
    pr = progress(p, r),
    rating = average(r);
  return (
    <Dialog title={p.title} close={close} className="detail">
      <div className="detail-header">
        <Cover p={p} />
        <div className="detail-header-shade" />
        <div>
          <div className="eyebrow">{sectionNames[p.section]}</div>
          <h2>{p.title}</h2>
          <p className="original-title">{p.original}</p>
          <div className="meta">
            <span>{p.year}</span>
            <i />
            <span>{typeNames[p.type]}</span>
            {p.phase && (
              <>
                <i />
                <span>Фаза {p.phase}</span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="detail-body">
        {cloudActive && <StartTogether projectId={p.id} />}
        <p className="synopsis">{p.description}</p>
        <div className="detail-premiere">
          <CalendarDays size={16} />
          Премьера в США: {dateLabel(p.date)}
        </div>
        <div className="detail-actions">
          {cloudActive &&
          family.snapshot.family?.watch_confirmation &&
          p.type !== "series" ? (
            <WatchControls project={p} done={done} className="primary" />
          ) : (
            <button
              className={"primary " + (done ? "completed" : "")}
              disabled={p.section === "future"}
              onClick={() => change(markAll(p, r, !done))}
            >
              {done ? <CheckCheck size={18} /> : <Check size={18} />}{" "}
              {p.section === "future"
                ? "Ожидаем премьеру"
                : done
                  ? "Посмотрели · отменить"
                  : p.type === "series"
                    ? "Отметить все вышедшие серии"
                    : "Посмотрели"}
            </button>
          )}
          <button
            className={"heart-action " + (r.favorite ? "gold" : "")}
            onClick={() => change({ ...r, favorite: !r.favorite })}
            aria-label="Избранное"
          >
            <Heart size={19} fill={r.favorite ? "currentColor" : "none"} />
          </button>
        </div>
        {p.type === "series" && (
          <section className="episode-section">
            <div className="detail-section-heading">
              <h3>Смотрим по сериям</h3>
              <span>
                {pr.done} / {pr.total}
              </span>
            </div>
            <Bar value={(pr.done / pr.total) * 100} />
            {p.seasons.map((s) => {
              const count = Array.from(
                { length: s.episodes },
                (_, i) => i + 1,
              ).filter(
                (e) =>
                  r.episodes.includes(episodeKey(s.number, e)) &&
                  available(p, s, e),
              ).length;
              return (
                <details
                  key={s.number}
                  open={p.seasons.length <= 2 || undefined}
                >
                  <summary>
                    <span>
                      Сезон {s.number}{" "}
                      <small>
                        {s.date.slice(0, 4)}
                        {s.phase ? ` · Фаза ${s.phase}` : ""}
                      </small>
                    </span>
                    <span>
                      {count}/{s.episodes}
                      <ChevronDown size={15} />
                    </span>
                  </summary>
                  <div className="season-tools">
                    <span>Премьера: {dateLabel(s.date)}</span>
                    <button
                      onClick={() => {
                        let episodes = r.episodes.filter(
                          (k) => !k.startsWith(`${s.number}:`),
                        );
                        if (count < s.episodes)
                          episodes = [
                            ...episodes,
                            ...Array.from(
                              { length: s.episodes },
                              (_, i) => i + 1,
                            )
                              .filter((e) => available(p, s, e))
                              .map((e) => episodeKey(s.number, e)),
                          ];
                        let n = { ...r, episodes };
                        n = {
                          ...n,
                          watched: watched(p, n),
                          date: watched(p, n) ? r.date || today() : "",
                        };
                        if (!n.watched) {
                          n.anton = null;
                          n.tanya = null;
                        }
                        change(n);
                      }}
                    >
                      {count === s.episodes ? "Снять сезон" : "Весь сезон"}
                    </button>
                  </div>
                  <div className="episode-grid">
                    {Array.from({ length: s.episodes }, (_, i) => i + 1).map(
                      (e) => {
                        const key = episodeKey(s.number, e),
                          checked = r.episodes.includes(key),
                          enabled = available(p, s, e);
                        const pending = family.snapshot.watchRequests.find(
                          (w) =>
                            w.project_id === p.id &&
                            w.season === s.number &&
                            w.episode === e &&
                            w.status === "pending",
                        );
                        return (
                          <button
                            key={e}
                            className={
                              checked
                                ? "checked"
                                : pending
                                  ? "pending-episode"
                                  : ""
                            }
                            disabled={!enabled}
                            aria-pressed={checked}
                            aria-label={`Сезон ${s.number}, серия ${e}${!enabled ? ", ещё не вышла" : ""}`}
                            onClick={() => {
                              if (
                                cloudActive &&
                                family.snapshot.family?.watch_confirmation &&
                                pending?.requested_by === family.user?.id
                              ) {
                                const row = family.snapshot.episodes.find(
                                  (w) =>
                                    w.project_id === p.id &&
                                    w.season === s.number &&
                                    w.episode === e,
                                );
                                void family
                                  .mutate(
                                    "episode",
                                    p.id,
                                    {
                                      season: s.number,
                                      episode: e,
                                      watched: false,
                                    },
                                    row?.version || 0,
                                  )
                                  .catch((e) =>
                                    family.setError(String(e.message || e)),
                                  );
                              } else change(toggleEpisode(p, r, key));
                            }}
                          >
                            {checked ? (
                              <Check size={14} />
                            ) : pending ? (
                              `${e} ◷`
                            ) : (
                              e
                            )}
                            {!enabled && (
                              <small>
                                {s.episodeDates?.[e - 1]
                                  ?.slice(5)
                                  .split("-")
                                  .reverse()
                                  .join(".")}
                              </small>
                            )}
                          </button>
                        );
                      },
                    )}
                  </div>
                </details>
              );
            })}
            <p className="muted">
              Сериал завершён только после всех серий всех включённых сезонов.
              Недоступные серии нельзя отметить.
            </p>
          </section>
        )}
        {p.type === "series" && <WatchInbox projectId={p.id} />}
        <section className="ratings-section">
          <div className="detail-section-heading">
            <h3>Как нам понравилось?</h3>
            <span className="gold">
              <Star size={15} fill="currentColor" />{" "}
              {rating !== null ? rating.toFixed(1) : "—"} <small>/ 10</small>
            </span>
          </div>
          {!canRate && (
            <p className="muted">
              {cloudActive
                ? "Сначала отметьте просмотр фильма или серии. Свою прежнюю оценку можно сбросить в любой момент."
                : "Оценки откроются после полного просмотра проекта."}
            </p>
          )}
          <div className="rating-fields">
            {(["anton", "tanya"] as const).map((who, i) => (
              <label key={who}>
                <span className={"avatar " + who}>{i === 0 ? "А" : "Т"}</span>
                <span>Оценка {i === 0 ? "Антона" : "Тани"}</span>
                <select
                  aria-label={`Оценка ${i === 0 ? "Антона" : "Тани"}`}
                  disabled={
                    cloudActive
                      ? who !== family.role || (!canRate && r[who] === null)
                      : !canRate
                  }
                  value={r[who] ?? ""}
                  onChange={(e) =>
                    change({
                      ...r,
                      [who]: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                >
                  <option value="">—</option>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <option
                      key={n}
                      value={n}
                      disabled={cloudActive && !canRate}
                    >
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <small className="muted">
            Выберите «—», чтобы сбросить оценку. Средняя пары требует двух
            оценок.
          </small>
        </section>
        <label className="date-field">
          <span>
            <CalendarDays size={17} />
            Дата просмотра
          </span>
          <input
            aria-label="Дата просмотра"
            type="date"
            max={today()}
            value={r.date}
            disabled={!done}
            onChange={(e) => change({ ...r, date: e.target.value })}
          />
        </label>
        <label className="notes-field">
          <span>
            Наша заметка <small>Только для нас</small>
          </span>
          <textarea
            aria-label="Наша заметка"
            maxLength={20000}
            placeholder="Что запомнилось? О чём спорили после титров?"
            value={r.note}
            onChange={(e) => change({ ...r, note: e.target.value })}
          />
        </label>
        <div className="detail-save">
          <ShieldCheck size={14} />
          {saveStatus}
        </div>
        <ProjectFamilyTools projectId={p.id} />
        <details className="detail-sources">
          <summary>
            Источники каталога
            <ChevronDown size={14} />
          </summary>
          <ul>
            {p.sources.map((url) => (
              <li key={url}>
                <a href={url} target="_blank" rel="noreferrer">
                  {new URL(url).hostname.replace("www.", "")}{" "}
                  <ArrowUpRight size={12} />
                </a>
              </li>
            ))}
          </ul>
          <p className="muted">
            Проверка: 08.11.2026. Дата премьеры зависит от региона. Порядок
            событий относится к основной истории; мультивселенные и сцены после
            титров могут выходить за его рамки.
          </p>
        </details>
      </div>
    </Dialog>
  );
}
