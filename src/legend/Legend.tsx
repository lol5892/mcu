import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "../family/client";
import { useFamily } from "../family/FamilyProvider";
import { legacyProjection } from "../family/projection";
import { catalog, today } from "../model";
import { Sheet } from "../family/ui";
import { updateBlocked } from "../pwa/safety";
import { evaluate, level, registry } from "./model";
import "./legend.css";
type Award = {
  achievement_id: string;
  owner: string;
  xp: number;
  unlocked_at: string;
  historical: boolean;
};
type Data = { awards: Award[]; seen: string[]; initial: boolean };
const Context = createContext<{ data: Data; error: string }>({
  data: { awards: [], seen: [], initial: false },
  error: "",
});
async function legendRPC(args: Record<string, unknown> = {}) {
  if (!supabase) throw Error("Cloud unavailable");
  const { data, error } = await supabase.rpc("mv_legend", args);
  if (error) throw error;
  return data as Data;
}
export function LegendProvider({ children }: { children: ReactNode }) {
  const f = useFamily();
  const [data, setData] = useState<Data>({
      awards: [],
      seen: [],
      initial: false,
    }),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [identity, setIdentity] = useState("");
  const queue = useRef<string[]>([]);
  const initialNotice = useRef(false);
  useEffect(() => {
    if (!f.familyId || !f.user || f.localMode) return;
    let alive = true,
      busy = false;
    const key = `mv-legend:${f.familyId}:${f.user.id}`;
    setData({ awards: [], seen: [], initial: false });
    setIdentity(key);
    try {
      const cache = localStorage.getItem(key);
      if (cache) setData(JSON.parse(cache));
    } catch {}
    async function read() {
      if (busy || !navigator.onLine || document.hidden) return;
      busy = true;
      try {
        const d = await legendRPC();
        if (!alive) return;
        if (!d || !Array.isArray(d.awards))
          throw Error("Invalid legend response");
        setData(d);
        localStorage.setItem(key, JSON.stringify(d));
        setError("");
        if (d.initial && !initialNotice.current) {
          await legendRPC({ p_ack: ["__baseline__"] });
          initialNotice.current = true;
          queue.current.push(
            `Наши прошлые подвиги найдены! Приключения уже принесли ${d.awards.length} достижений.`,
          );
        } else {
          const fresh = d.awards.filter(
            (a) => !d.seen.includes(a.achievement_id),
          );
          if (fresh.length) {
            await legendRPC({
              p_ack: fresh.map((a) => a.achievement_id),
            });
            for (const a of fresh) {
              const spec = registry.find((r) => r.id === a.achievement_id);
              queue.current.push(
                `Достижение открыто! ${spec?.title} · +${a.xp} XP`,
              );
            }
          }
        }
      } catch {
        if (alive)
          setError(
            "История наград временно недоступна. Повторим при подключении.",
          );
      } finally {
        busy = false;
      }
    }
    const channel = supabase
      ?.channel("legend-history:" + f.familyId)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "mv_achievements",
          filter: "family_id=eq." + f.familyId,
        },
        () => void read(),
      )
      .subscribe();
    void read();
    const interval = setInterval(() => void read(), 5000);
    window.addEventListener("online", read);
    return () => {
      alive = false;
      if (channel) void supabase?.removeChannel(channel);
      clearInterval(interval);
      window.removeEventListener("online", read);
      queue.current = [];
    };
  }, [f.familyId, f.user?.id, f.localMode]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (
        !queue.current.length ||
        updateBlocked() ||
        document.querySelector(
          '[role="dialog"],input:focus,textarea:focus,select:focus',
        ) ||
        f.snapshot.sessions.some((s) => s.status === "active")
      )
        return;
      setNotice(queue.current.shift()!);
      setTimeout(() => setNotice(""), 6000);
    }, 7000);
    return () => clearInterval(timer);
  }, [f.snapshot.sessions]);
  return (
    <Context.Provider
      value={{
        data:
          identity === `mv-legend:${f.familyId}:${f.user?.id}`
            ? data
            : { awards: [], seen: [], initial: false },
        error,
      }}
    >
      {children}
      {notice && (
        <div className="legend-toast" role="status">
          {notice}
        </div>
      )}
    </Context.Provider>
  );
}
const names: Record<string, string> = {
  path: "Путь Мстителей",
  phases: "Сага по фазам",
  heroes: "Легенды героев",
  series: "Мир сериалов",
  critics: "Два кинокритика",
  family: "Наша собственная вселенная",
};
export function Emblem({ id }: { id: string }) {
  const spec = registry.find((a) => a.id === id),
    index = registry.findIndex((a) => a.id === id),
    phase = id.startsWith("phase-") ? Number(id.split("-")[1]) : 0;
  const colors = [
    "#e5c58a",
    "#f3c16e",
    "#70baff",
    "#ffbb67",
    "#cfa2ff",
    "#6fdfda",
    "#ff9e78",
  ];
  const paths = {
    reactor: "M12 2 22 8v9l-10 6L2 17V8ZM6 9h12l-6 10Z",
    hammer: "M3 3h13v8H3ZM9 11v11h4V11M16 5l5 2v6l-5-2",
    shield:
      "M12 2 22 6v7c0 6-10 10-10 10S2 19 2 13V6ZM12 6l2 5h5l-4 3 2 5-5-3-5 3 2-5-4-3h5Z",
    star: "M12 2 15 9l8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1Z",
    heart: "M20 5c-4-4-8 1-8 1S8 1 4 5c-5 5 0 10 8 16 8-6 13-11 8-16Z",
    orbit: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 18 21 6M3 6l18 12M12 3v18",
    rocket:
      "M8 16 5 19 3 21l2-5M8 16l-3-4 4-2c2-5 7-7 12-7 0 5-2 10-7 12l-2 4ZM14 8h2v2h-2",
    eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12ZM16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
    film: "M3 3h18v18H3ZM8 3v18M16 3v18M3 8h5M3 16h5M16 8h5M16 16h5",
    trophy:
      "M6 2h12v9a6 6 0 0 1-12 0ZM6 5H2v4c0 3 4 4 5 4M18 5h4v4c0 3-4 4-5 4M12 17v5M7 22h10",
    portal: "M12 2 21 7v10l-9 5-9-5V7ZM12 6l5 3v6l-5 3-5-3V9ZM12 10v4",
  };
  const phaseGlyphs: Record<number, string> = {
    1: paths.shield,
    2: paths.reactor,
    3: paths.heart,
    4: paths.portal,
    5: paths.rocket,
    6: paths.orbit,
  };
  const glyph = phase
    ? phaseGlyphs[phase]
    : id.includes("stark") || id.includes("reactor")
      ? paths.reactor
      : id.includes("thor") || phase === 1
        ? paths.hammer
        : id.includes("cap") || id.includes("avengers") || phase === 2
          ? paths.shield
          : id.includes("strange") || id.includes("worlds") || phase === 4
            ? paths.portal
            : id.includes("guardians") || id.includes("planets")
              ? paths.rocket
              : spec?.category === "family" || id.includes("infinity")
                ? paths.heart
                : spec?.category === "critics"
                  ? paths.star
                  : spec?.category === "series"
                    ? paths.film
                    : phase === 5 || phase === 6
                      ? paths.orbit
                      : paths.trophy;
  const color = phase
    ? colors[phase]
    : spec?.rarity === "legendary"
      ? colors[0]
      : spec?.owner === "tanya"
        ? "#c8a7e6"
        : spec?.owner === "anton"
          ? "#8fb8e8"
          : "#c3cce0";
  return (
    <svg
      className="legend-emblem"
      viewBox="0 0 64 64"
      aria-hidden="true"
      style={{ color }}
    >
      <path
        d="M18 3h28l15 15v28L46 61H18L3 46V18Z"
        fill="currentColor"
        opacity=".07"
      />
      <path
        d="M18 3h28l15 15v28L46 61H18L3 46V18Z"
        stroke="currentColor"
        fill="none"
        opacity=".65"
      />
      <path
        d="M20 7h24l13 13v24L44 57H20L7 44V20Z"
        stroke="currentColor"
        fill="none"
        opacity=".22"
      />
      <g
        transform="translate(20 17)"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <path d={glyph} />
      </g>
      <text
        x="32"
        y="53"
        textAnchor="middle"
        fill="currentColor"
        fontSize="7"
        letterSpacing="2"
      >
        {String(index + 1).padStart(2, "0")}
      </text>
    </svg>
  );
}
export function LegendHomePreview() {
  const { data } = useContext(Context);
  const last = [...data.awards].sort((a, b) =>
    b.unlocked_at.localeCompare(a.unlocked_at),
  )[0];
  const spec = last && registry.find((r) => r.id === last.achievement_id);
  return (
    <button
      className="legend-home-preview"
      onClick={() => (location.hash = "/legend")}
    >
      {spec ? <Emblem id={spec.id} /> : <Emblem id="films-1" />}
      <span>
        <small>{spec ? "ПОСЛЕДНИЙ ТРОФЕЙ" : "НАША ЛЕГЕНДА"}</small>
        <strong>{spec?.title || "Собираем историю наших приключений"}</strong>
      </span>
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M6 18 18 6M6 6h12v12"
          stroke="currentColor"
          fill="none"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
export function Legend({ onProject }: { onProject: (id: string) => void }) {
  const f = useFamily(),
    { data, error } = useContext(Context);
  const [category, setCategory] = useState("all"),
    [filter, setFilter] = useState("all"),
    [selected, setSelected] = useState<string | null>(null);
  const rows = useMemo(
    () =>
      evaluate(
        legacyProjection(f.serverSnapshot || f.snapshot, f.user?.id || ""),
        today(),
        (f.serverSnapshot || f.snapshot).ratings.map((r) => ({
          owner:
            f.snapshot.members.find((m) => m.user_id === r.user_id)?.role || "",
          project_id: r.project_id,
          score: r.score,
        })),
      ),
    [f.serverSnapshot, f.snapshot, f.user?.id],
  );
  const awards = new Map(data.awards.map((a) => [a.achievement_id, a]));
  const xp = (owner: string) =>
    data.awards.filter((a) => a.owner === owner).reduce((n, a) => n + a.xp, 0);
  const familyLevel = level(xp("family"));
  const chosen = rows.find((a) => a.id === selected);
  const nearest = rows
    .filter((a) => !awards.has(a.id))
    .sort((a, b) => b.current / b.threshold - a.current / a.threshold)[0];
  return (
    <section className="legend">
      <div className="eyebrow">АНТОН + ТАНЯ</div>
      <h1>Наша легенда</h1>
      <p>Каждый фильм — новая глава нашей истории</p>
      <div className="panel legend-summary">
        <h2>Уровень семьи {familyLevel.level}</h2>
        <p>
          {xp("family")} XP · {data.awards.length} / {rows.length} наград
        </p>
        {data.awards.length > 0 && (
          <p>
            Последняя награда:{" "}
            {
              registry.find((r) => r.id === data.awards.at(-1)?.achievement_id)
                ?.title
            }
          </p>
        )}
        <progress
          aria-label="Опыт до следующего уровня"
          value={familyLevel.current}
          max={familyLevel.total}
        />
        <small className="legend-level-next">
          {familyLevel.current} / {familyLevel.total} XP до уровня{" "}
          {familyLevel.level + 1}
        </small>
        <p>
          Антон: уровень {level(xp("anton")).level} · {xp("anton")} XP
          <br />
          Таня: уровень {level(xp("tanya")).level} · {xp("tanya")} XP
        </p>
        {nearest && (
          <button onClick={() => setSelected(nearest.id)}>
            Следующая глава: {nearest.title} · {nearest.current}/
            {nearest.threshold}
          </button>
        )}
      </div>
      {error && <p role="status">{error}</p>}
      <div className="legend-filters">
        <select
          aria-label="Коллекция наград"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="all">Все коллекции</option>
          {Object.entries(names).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          aria-label="Статус наград"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">Все</option>
          <option value="open">Открытые</option>
          <option value="locked">Неоткрытые</option>
          <option value="near">Почти получены</option>
        </select>
      </div>
      <div className="legend-grid">
        {rows
          .filter(
            (a) =>
              (category === "all" || a.category === category) &&
              (filter === "all" ||
                (filter === "open" && awards.has(a.id)) ||
                (filter === "locked" && !awards.has(a.id)) ||
                (filter === "near" &&
                  !awards.has(a.id) &&
                  a.current / a.threshold >= 0.5)),
          )
          .map((a) => (
            <button
              className={`legend-card ${awards.has(a.id) ? "earned" : ""} ${a.rarity}`}
              key={a.id}
              onClick={() => setSelected(a.id)}
            >
              <Emblem id={a.id} />
              <small>
                {a.owner === "family"
                  ? "Антон + Таня"
                  : a.owner === "anton"
                    ? "Антон"
                    : "Таня"}{" "}
                ·{" "}
                {a.rarity === "legendary"
                  ? "Легендарная"
                  : a.rarity === "epic"
                    ? "Эпическая"
                    : a.rarity === "rare"
                      ? "Редкая"
                      : "Обычная"}
              </small>
              <h3>{a.title}</h3>
              <small>
                +
                {a.rarity === "legendary"
                  ? 100
                  : a.rarity === "epic"
                    ? 50
                    : a.rarity === "rare"
                      ? 25
                      : 10}{" "}
                XP
              </small>
              <progress value={a.current} max={a.threshold} />
              <span>
                {a.current} / {a.threshold} ·{" "}
                {awards.has(a.id)
                  ? "Получено"
                  : a.qualified
                    ? "Ожидает сохранения"
                    : "Впереди"}
              </span>
            </button>
          ))}
      </div>
      {chosen && (
        <Sheet title={chosen.title} close={() => setSelected(null)}>
          <Emblem id={chosen.id} />
          <p>{chosen.description || "Новая глава нашей истории Marvel."}</p>
          <p>
            {chosen.missing.some(
              (id) => catalog.find((p) => p.id === id)?.section === "future",
            )
              ? "Коллекция ожидает будущих релизов. "
              : ""}
            {chosen.current} / {chosen.threshold}
            {awards.get(chosen.id) &&
              ` · ${new Date(awards.get(chosen.id)!.unlocked_at).toLocaleDateString("ru-RU")}`}
          </p>
          {chosen.projects.map((id) => (
            <button
              className="legend-project"
              key={id}
              onClick={() => {
                setSelected(null);
                onProject(id);
              }}
            >
              {chosen.missing.includes(id) ? "○" : "✓"}{" "}
              {catalog.find((p) => p.id === id)?.title}
            </button>
          ))}
        </Sheet>
      )}
    </section>
  );
}
