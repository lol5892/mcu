import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { supabase, errorText } from "./client";
import {
  blankSnapshot,
  type Snapshot,
  type Operation,
  type Role,
} from "./types";
import {
  cachedSnapshot,
  cacheSnapshot,
  listOperations,
  putOperation,
  removeOperation,
  forgetUserCache,
} from "./cache";
import { applyOptimistic, legacyProjection } from "./projection";
import { emptyEntry, type Entry, type Records } from "../model";
type FamilyContextValue = {
  user: User | null;
  avatars: Record<string, string>;
  role: Role | null;
  familyId: string | null;
  snapshot: Snapshot;
  records: Records;
  ready: boolean;
  offline: boolean;
  localMode: boolean;
  setLocalMode: (v: boolean) => void;
  error: string;
  setError: (s: string) => void;
  operations: Operation[];
  refresh: () => Promise<void>;
  mutate: (
    kind: string,
    target: string,
    payload: Record<string, unknown>,
    expected?: number,
  ) => Promise<void>;
  changeEntry: (id: string, next: Entry) => Promise<void>;
  signOut: () => Promise<void>;
  rpc: <T = unknown>(
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<T>;
  retry: () => Promise<void>;
  discard: (id: string) => Promise<void>;
};
const Context = createContext<FamilyContextValue | null>(null);
export const useFamily = () => {
  const value = useContext(Context);
  if (!value) throw Error("FamilyProvider missing");
  return value;
};
const tables = {
  members: "mv_members",
  profile: "mv_profiles",
  entries: "mv_entries",
  episodes: "mv_episodes",
  ratings: "mv_ratings",
  letters: "mv_letters",
  messages: "mv_messages",
  sessions: "mv_sessions",
  events: "mv_events",
  moments: "mv_moments",
  media: "mv_media",
  reactions: "mv_reactions",
  notifications: "mv_notifications",
  devices: "mv_devices",
  legacy: "mv_legacy_ratings",
  favorites: "mv_letter_favorites",
  history: "mv_rating_history",
  welcome: "mv_welcome",
} as const;
export function FamilyProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [snapshot, setSnapshot] = useState<Snapshot>(blankSnapshot),
    [ready, setReady] = useState(!supabase),
    [offline, setOffline] = useState(!navigator.onLine),
    [error, setError] = useState(""),
    [operations, setOperations] = useState<Operation[]>([]),
    [localMode, setLocalMode] = useState(!supabase),
    [avatars, setAvatars] = useState<Record<string, string>>({});
  const identity = useRef<User | null>(null),
    state = useRef(snapshot),
    flushing = useRef<Promise<void> | null>(null),
    batching = useRef(false),
    revision = useRef(0),
    refreshing = useRef<Promise<void> | null>(null);
  state.current = snapshot;
  const role =
    snapshot.members.find((m) => m.user_id === user?.id)?.role || null;
  const familyId =
    snapshot.members.find((m) => m.user_id === user?.id)?.family_id || null;
  const avatarKey = snapshot.media
    .filter((m) => m.kind === "avatar" && m.ready)
    .map((m) => m.id)
    .join(",");
  useEffect(() => {
    if (!supabase || !familyId) {
      setAvatars({});
      return;
    }
    let active = true;
    const urls: string[] = [];
    const latest = new Map(
      snapshot.media
        .filter((m) => m.kind === "avatar" && m.ready)
        .map((m) => [m.author_id, m]),
    );
    void Promise.all(
      [...latest].map(async ([id, media]) => {
        const { data } = await supabase!.storage
          .from("marvel-private")
          .download(media.object_path);
        if (!data) return null;
        const url = URL.createObjectURL(data);
        urls.push(url);
        return [id, url] as const;
      }),
    ).then((rows) => {
      if (active)
        setAvatars(
          Object.fromEntries(
            rows.filter((r): r is readonly [string, string] => r !== null),
          ),
        );
      else for (const url of urls) URL.revokeObjectURL(url);
    });
    return () => {
      active = false;
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [familyId, user?.id, avatarKey]);
  const rpc = useCallback(
    async <T,>(
      name: string,
      args: Record<string, unknown> = {},
    ): Promise<T> => {
      if (!supabase) throw Error("Supabase ещё не настроен.");
      const { data, error } = await supabase.rpc(name, args);
      if (error) throw error;
      return data as T;
    },
    [],
  );
  const refresh = useCallback(async () => {
    if (refreshing.current) return refreshing.current;
    const task = (async () => {
      const who = identity.current;
      if (!supabase || !who) return;
      if (!navigator.onLine) {
        const old = await cachedSnapshot(who.id);
        if (old) {
          state.current = old;
          setSnapshot(old);
        }
        setReady(true);
        return;
      }
      const currentRevision = revision.current;
      try {
        const values = await Promise.all(
          Object.entries(tables).map(async ([key, table]) => {
            let query = supabase!
              .from(table)
              .select(key === "devices" ? "id,name,enabled,updated_at" : "*");
            if (key === "messages")
              query = query
                .order("created_at", { ascending: false })
                .limit(1000);
            if (key === "history")
              query = query
                .order("changed_at", { ascending: false })
                .limit(500);
            const { data, error } = await query;
            if (error) throw error;
            return [
              key,
              key === "profile" || key === "welcome"
                ? data?.[0] || null
                : data || [],
            ] as const;
          }),
        );
        if (
          identity.current?.id !== who.id ||
          currentRevision !== revision.current
        )
          return;
        let next = {
          ...blankSnapshot(),
          ...Object.fromEntries(values),
          cachedAt: new Date().toISOString(),
        } as Snapshot;
        const pending = await listOperations(who.id);
        for (const op of pending.filter((o) => o.state === "queued"))
          next = applyOptimistic(next, op);
        state.current = next;
        setSnapshot(next);
        setOperations(pending);
        await cacheSnapshot(who.id, next);
        setError("");
      } catch (e) {
        const old = await cachedSnapshot(who.id);
        if (old && identity.current?.id === who.id) {
          state.current = old;
          setSnapshot(old);
        }
        setError(errorText(e));
      } finally {
        setReady(true);
      }
    })();
    refreshing.current = task;
    try {
      await task;
    } finally {
      refreshing.current = null;
    }
  }, []);
  const flush = useCallback(async () => {
    const who = identity.current;
    if (!who || !supabase || !navigator.onLine) return;
    if (flushing.current) {
      await flushing.current;
      return;
    }
    const task = (async () => {
      try {
        while (navigator.onLine && identity.current?.id === who.id) {
          const op = (await listOperations(who.id))[0];
          if (!op || op.state !== "queued") break;
          const { error } = await supabase!.rpc("mv_apply", {
            p_id: op.id,
            p_kind: op.kind,
            p_target: op.target,
            p_payload: op.payload,
            p_expected: op.expected,
          });
          if (error) {
            if (
              error.code === "40001" ||
              error.message.includes("VERSION_CONFLICT")
            )
              await putOperation({
                ...op,
                state: "conflict",
                error: errorText(error),
              });
            else if (
              !navigator.onLine ||
              /fetch|network/i.test(error.message)
            ) {
              setError(
                "Действия сохранены на устройстве и ждут подтверждения сервера.",
              );
              break;
            } else
              await putOperation({
                ...op,
                state: "failed",
                error: errorText(error),
              });
            setError(errorText(error));
            break;
          }
          await removeOperation(op.id);
        }
      } finally {
        setOperations(await listOperations(who.id));
        await refresh();
      }
    })();
    flushing.current = task;
    try {
      await task;
    } finally {
      if (flushing.current === task) flushing.current = null;
    }
  }, [refresh]);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const setSessionUser = (next: User | null) => {
      if (!active) return;
      revision.current++;
      identity.current = next;
      setUser(next);
      setSnapshot(blankSnapshot());
      state.current = blankSnapshot();
      setReady(!next);
      if (next) setTimeout(() => void refresh().then(flush), 0);
    };
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setError(errorText(error));
      setSessionUser(data.session?.user || null);
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && session.user.id === identity.current?.id) {
        // Refresh/password updates for this same verified identity must not
        // unmount an open form or discard its success feedback.
        identity.current = session.user;
        setUser(session.user);
        return;
      }
      setSessionUser(session?.user || null);
    });
    const online = () => {
      setOffline(!navigator.onLine);
      if (navigator.onLine) void flush();
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    return () => {
      active = false;
      data.subscription.unsubscribe();
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
    };
  }, [refresh, flush]);
  useEffect(() => {
    if (!supabase || !familyId || !user) return;
    let timer: ReturnType<typeof setTimeout>;
    const channel = supabase.channel(`family:${familyId}:${user.id}`);
    for (const table of Object.values(tables))
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          clearTimeout(timer);
          timer = setTimeout(() => void refresh(), 180);
        },
      );
    let cancelled = false;
    // Explicitly bind the current verified session before joining Postgres
    // Changes. This also avoids subscribing while Auth is restoring storage.
    void supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (cancelled || !data.session) return;
        await supabase!.realtime.setAuth(data.session.access_token);
        if (!cancelled)
          channel.subscribe((status) => {
            // Refetch after every successful join: replication may have missed
            // changes made while a free-tier tenant was starting or reconnecting.
            if (!cancelled && status === "SUBSCRIBED") void refresh();
          });
      })
      .catch(() => {
        /* Foreground polling remains available during reconnect. */
      });
    const poll = setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine)
        void refresh();
    }, 5000);
    const visible = () => {
      if (document.visibilityState === "visible") void flush();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", visible);
      void supabase!.removeChannel(channel);
    };
  }, [familyId, user?.id, refresh, flush]);
  const mutate = useCallback(
    async (
      kind: string,
      target: string,
      payload: Record<string, unknown>,
      expected = 0,
    ) => {
      const who = identity.current;
      const f = state.current.members.find(
        (m) => m.user_id === who?.id,
      )?.family_id;
      if (!who || !f) throw Error("Сначала войдите в семейное пространство.");
      if (
        !navigator.onLine &&
        !["entry", "episode", "rating", "message"].includes(kind) &&
        !(kind === "letter" && payload.status === "draft")
      )
        throw Error("Для этого действия нужен интернет.");
      if ((await listOperations(who.id)).some((o) => o.state !== "queued"))
        throw Error("Сначала разрешите конфликт в разделе синхронизации.");
      const op: Operation = {
        id: crypto.randomUUID(),
        userId: who.id,
        familyId: f,
        kind,
        target,
        payload,
        expected,
        createdAt: new Date().toISOString(),
        state: "queued",
      };
      await putOperation(op);
      const next = applyOptimistic(state.current, op);
      state.current = next;
      setSnapshot(next);
      await cacheSnapshot(who.id, next);
      setOperations(await listOperations(who.id));
      if (batching.current) return;
      await flush();
      if (
        navigator.onLine &&
        (await listOperations(who.id)).some(
          (o) => o.id === op.id && o.state === "queued",
        )
      )
        await flush();
      const after = await listOperations(who.id);
      const failed = after.find((o) => o.id === op.id && o.state !== "queued");
      if (failed) throw Error(failed.error);
      if (
        after.some((o) => o.id === op.id) &&
        !["entry", "episode", "rating", "message"].includes(kind) &&
        !(kind === "letter" && payload.status === "draft")
      )
        throw Error(
          "Сервер ещё не подтвердил действие. Оно сохранено в очереди; не создавайте повторную отправку.",
        );
    },
    [flush],
  );
  const changeEntry = useCallback(
    async (id: string, next: Entry) => {
      const who = identity.current;
      if (!who) return;
      const previous =
        legacyProjection(state.current, who.id)[id] || emptyEntry();
      const r = state.current.members.find((m) => m.user_id === who.id)?.role;
      if (!r) throw Error("Нет семейного профиля.");
      batching.current = true;
      try {
        if (
          next.note !== previous.note ||
          next.date !== previous.date ||
          next.watched !== previous.watched
        ) {
          const row = state.current.entries.find((e) => e.project_id === id);
          const patch: Record<string, unknown> = {};
          if (next.note !== previous.note) patch.note = next.note;
          if (next.date !== previous.date)
            patch.watched_date = next.date || null;
          if (next.watched !== previous.watched) patch.watched = next.watched;
          await mutate("entry", id, patch, row?.version || 0);
        }
        for (const key of new Set([...previous.episodes, ...next.episodes]))
          if (previous.episodes.includes(key) !== next.episodes.includes(key)) {
            const [season, episode] = key.split(":").map(Number);
            const row = state.current.episodes.find(
              (e) =>
                e.project_id === id &&
                e.season === season &&
                e.episode === episode,
            );
            await mutate(
              "episode",
              id,
              { season, episode, watched: next.episodes.includes(key) },
              row?.version || 0,
            );
          }
        if (next[r] !== previous[r] || next.favorite !== previous.favorite) {
          const row = state.current.ratings.find(
            (e) =>
              e.user_id === who.id && e.project_id === id && e.season === 0,
          );
          await mutate(
            "rating",
            id,
            { season: 0, score: next[r], favorite: next.favorite },
            row?.version || 0,
          );
        }
      } finally {
        batching.current = false;
        await flush();
        if (
          navigator.onLine &&
          (await listOperations(who.id)).some((o) => o.state === "queued")
        )
          await flush();
      }
      if ((await listOperations(who.id)).some((o) => o.state !== "queued"))
        throw Error(
          "Не удалось применить изменение. Откройте очередь синхронизации.",
        );
    },
    [mutate, flush],
  );
  async function signOut() {
    if (!supabase || !user) return;
    if (operations.length)
      throw Error(
        "Сначала синхронизируйте или экспортируйте ожидающие действия.",
      );
    const id = user.id;
    await supabase.auth.signOut({ scope: "local" });
    await forgetUserCache(id);
    setSnapshot(blankSnapshot());
    setOperations([]);
    setLocalMode(false);
  }
  async function discard(id: string) {
    const op = operations.find((o) => o.id === id);
    if (!op) return;
    await removeOperation(id);
    if (user) {
      setOperations(await listOperations(user.id));
    }
    await refresh();
  }
  return (
    <Context.Provider
      value={{
        user,
        avatars,
        role,
        familyId,
        snapshot,
        records: user ? legacyProjection(snapshot, user.id) : {},
        ready,
        offline,
        localMode,
        setLocalMode,
        error,
        setError,
        operations,
        refresh,
        mutate,
        changeEntry,
        signOut,
        rpc,
        retry: flush,
        discard,
      }}
    >
      {children}
    </Context.Provider>
  );
}
