import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Film } from "lucide-react";
import { useFamily } from "./FamilyProvider";
import { supabase } from "./client";
import { catalog, watched } from "../model";
import { Sheet } from "./ui";
import { PrivatePhoto } from "./media";
import { useUpdateBlocker } from "../pwa/useUpdateBlocker";
import { characterCount } from "./impressions";
type Impression = {
  id: string;
  family_id: string;
  user_id: string;
  project_id: string;
  body: string | null;
  version: number;
};
const Context = createContext<{
  rows: Impression[];
  edit: (id: string) => void;
  refresh: () => Promise<void>;
}>({ rows: [], edit: () => {}, refresh: async () => {} });
export function AfterCreditsProvider({ children }: { children: ReactNode }) {
  const f = useFamily(),
    ref = useRef(f);
  ref.current = f;
  const [savedNotice,setSavedNotice]=useState("");
  useEffect(()=>{let timer:ReturnType<typeof setTimeout>;const show=(e:Event)=>{setSavedNotice((e as CustomEvent<string>).detail);clearTimeout(timer);timer=setTimeout(()=>setSavedNotice(""),3000);};window.addEventListener("mv-impression-saved",show);return()=>{window.removeEventListener("mv-impression-saved",show);clearTimeout(timer);};},[]);
  const [rows, setRows] = useState<Impression[]>([]),
    [project, setProject] = useState<string | null>(null);
  async function refresh() {
    const state = ref.current;
    if (!supabase || !state.familyId || !state.user) return;
    const { data, error } = await supabase
      .from("mv_impressions")
      .select("*")
      .eq("family_id", state.familyId);
    if (!error && data && ref.current.user?.id === state.user.id) {
      setRows(data);
      localStorage.setItem(
        `mv-impressions:${state.familyId}:${state.user.id}`,
        JSON.stringify(data),
      );
    }
  }
  useEffect(() => {
    setRows([]);
    if (!f.familyId || !f.user) return;
    const key = `mv-impressions:${f.familyId}:${f.user.id}`;
    try {
      setRows(JSON.parse(localStorage.getItem(key) || "[]"));
    } catch {}
    void refresh();
    const timer = setInterval(() => {
      if (navigator.onLine && !document.hidden) void refresh();
    }, 5000);
    const channel = supabase
      ?.channel("impressions:" + f.familyId)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "mv_impressions",
          filter: "family_id=eq." + f.familyId,
        },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      clearInterval(timer);
      if (channel) void supabase?.removeChannel(channel);
    };
  }, [f.familyId, f.user?.id]);
  useEffect(() => {
    const open = (event: Event) => {
      setTimeout(() => {
        const id = (event as CustomEvent<string>).detail,
          p = catalog.find((p) => p.id === id),
          state = ref.current;
        if (!p) return;
        if (p.type === "series" && !watched(p, state.records[id])) return;
        setProject(id);
      }, 0);
    };
    window.addEventListener("mv-after-credits", open);
    return () => window.removeEventListener("mv-after-credits", open);
  }, []);
  return (
    <Context.Provider value={{ rows, edit: setProject, refresh }}>
      {children}
      {savedNotice&&<div className="toast" role="status">{savedNotice}</div>}
      {project && (
        <Editor
          key={`${f.user?.id}:${project}`}
          projectId={project}
          close={() => setProject(null)}
        />
      )}
    </Context.Provider>
  );
}
function Editor({
  projectId,
  close,
}: {
  projectId: string;
  close: () => void;
}) {
  const f = useFamily(),
    ctx = useContext(Context),
    own = ctx.rows.find(
      (r) => r.user_id === f.user?.id && r.project_id === projectId,
    ),
    key = `mv-impression-draft:${f.familyId}:${f.user?.id}:${projectId}`;
  const [text, setText] = useState(
      () => localStorage.getItem(key) ?? own?.body ?? "",
    ),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  const count = characterCount(text);
  useUpdateBlocker("impression-editor", busy || text !== (own?.body || ""));
  useEffect(() => {
    try {
      localStorage.setItem(key, text);
    } catch {
      setStatus(
        "Не удалось сохранить черновик на устройстве. Не закрывайте окно до отправки.",
      );
    }
  }, [text, key]);
  useEffect(() => {
    const vv = window.visualViewport;
    const el = document
      .querySelector(".after-credits")
      ?.closest(".family-sheet-backdrop") as HTMLElement | null;
    const update = () => {
      if (!el || !vv) return;
      el.style.top = vv.offsetTop + "px";
      el.style.height = vv.height + "px";
      el.style.bottom = "auto";
    };
    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
    };
  }, []);
  async function save(body: string | null) {
    if (!supabase) return;
    if (!navigator.onLine) {
      setStatus("Нет соединения. Черновик сохранён на устройстве.");
      return;
    }
    setBusy(true);
    setStatus("Сохраняем…");
    const { error } = await supabase.rpc("mv_impression", {
      p_project: projectId,
      p_body: body,
      p_expected: own?.version || 0,
    });
    setBusy(false);
    if (error) {
      setStatus(
        error.code === "40001"
          ? "Впечатление изменено на другом устройстве. Ваш черновик сохранён. Закройте окно и сравните записи."
          : "Не удалось сохранить. Черновик сохранён — попробуйте ещё раз.",
      );
      await ctx.refresh();
      return;
    }
    localStorage.removeItem(key);
    await ctx.refresh();
    setStatus("Сохранено");
    window.dispatchEvent(new CustomEvent("mv-impression-saved",{detail:body===null?"Впечатление удалено":"Впечатление сохранено"}));
    close();
  }
  return (
    <Sheet title="Что осталось после титров?" close={close}>
      <section className="family-form after-credits">
        <Film size={24} />
        <h3>{catalog.find((p) => p.id === projectId)?.title}</h3>
        <p>Сохрани своё впечатление об этой истории</p>
        <textarea
          aria-label="Личное впечатление"
          placeholder="Что тебе запомнилось больше всего?"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
        />
        <output aria-live="polite">{count} / 200</output>
        {count > 200 && (
          <p role="alert">Сократи впечатление до 200 символов.</p>
        )}
        <p role="status">{f.offline?"Нет соединения. Черновик сохранён на устройстве.":status}</p>
        <button
          className="primary"
          disabled={busy || !text.trim() || count > 200}
          onClick={() => void save(text)}
        >
          Сохранить впечатление
        </button>
        <button className="wide-button" disabled={busy} onClick={close}>
          Не сейчас
        </button>
        <small>Незавершённый текст сохраняется на этом устройстве.</small>
        {own?.body && (
          <button
            className="danger-button"
            disabled={busy}
            onClick={() => {
              if (confirm("Удалить своё впечатление?")) void save(null);
            }}
          >
            Удалить впечатление
          </button>
        )}
      </section>
    </Sheet>
  );
}
export function Impressions({ projectId }: { projectId: string }) {
  const f = useFamily(),
    ctx = useContext(Context);
  return (
    <section className="impressions">
      <h3>После титров</h3>
      {(["anton", "tanya"] as const).map((role) => {
        const member = f.snapshot.members.find((m) => m.role === role),
          row = ctx.rows.find(
            (r) => r.project_id === projectId && r.user_id === member?.user_id,
          );
        return (
          <article className="panel" key={role}>
            <strong>{role === "anton" ? "Антон" : "Таня"}</strong>
            <p>
              {row?.body ||
                `${role === "anton" ? "Антон" : "Таня"} пока не ${role === "anton" ? "поделился" : "поделилась"} впечатлением`}
            </p>
            {f.role === role && (
              <button
                className="text-button"
                onClick={() => ctx.edit(projectId)}
              >
                {row?.body ? "Изменить" : "Написать"}
              </button>
            )}
          </article>
        );
      })}
    </section>
  );
}
export function PhotoArchive() {
  const f = useFamily();
  return (
    <section>
      <h1>Наш фотоархив</h1>
      <p>Фотографии наших вечеров, включая снимки из прежних переписок.</p>
      <div className="session-photo-grid">
        {f.snapshot.media
          .filter((m) => !["avatar", "staged"].includes(m.kind) && m.ready)
          .map((m) => (
            <PrivatePhoto key={m.id} media={m} />
          ))}
      </div>
    </section>
  );
}
