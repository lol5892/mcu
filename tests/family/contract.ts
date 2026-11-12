// Browser contract fixture only. This is not a Supabase Auth/Realtime service.
// Real PostgreSQL authorization is tested separately in supabase/tests/security.sql.
import type { BrowserContext, Route } from "@playwright/test";
const anton = "11111111-1111-4111-8111-111111111111",
  tanya = "22222222-2222-4222-8222-222222222222",
  family = "99999999-9999-4999-8999-999999999999";
export const userIds = { anton, tanya };
export function fixture(recoverInvitation = false, watchConfirmation = false) {
  const now = new Date().toISOString();
  const profiles = new Map(
    [anton, tanya].map((id) => [
      id,
      {
        id,
        avatar_path: null,
        welcome_seen_at: null,
        onboarding_seen_at: null,
        read_receipts: false,
        timezone: "Europe/Moscow",
        notification_types: {},
        quiet_start: "22:00:00",
        quiet_end: "09:00:00",
        reminder_hours: [24, 1],
        nudge_frequency: 0,
        letter_nudges: false,
      },
    ]),
  );
  const tables: Record<string, any[]> = {
    mv_families: [{ id: family, watch_confirmation: watchConfirmation }],
    mv_watch_requests: [],
    mv_members: [
      { family_id: family, user_id: anton, role: "anton", joined_at: now },
      { family_id: family, user_id: tanya, role: "tanya", joined_at: now },
    ],
    mv_entries: [
      {
        family_id: family,
        project_id: "iron-man",
        watched: true,
        watched_date: "2026-11-07",
        note: "",
        version: 1,
        updated_by: anton,
        updated_at: now,
      },
    ],
    mv_episodes: [
      {
        family_id: family,
        project_id: "loki",
        season: 1,
        episode: 1,
        watched: true,
        version: 1,
        updated_by: anton,
      },
    ],
    mv_ratings: [
      {
        family_id: family,
        user_id: anton,
        project_id: "iron-man",
        season: 0,
        score: 8,
        favorite: true,
        version: 1,
        updated_at: now,
      },
      {
        family_id: family,
        user_id: tanya,
        project_id: "iron-man",
        season: 0,
        score: 9,
        favorite: false,
        version: 1,
        updated_at: now,
      },
    ],
    mv_letters: [],
    mv_messages: [],
    mv_events: [],
    mv_sessions: [],
    mv_moments: [],
    mv_media: [],
    mv_media_links: [],
    mv_reactions: [],
    mv_notifications: [],
    mv_devices: [],
    mv_legacy_ratings: [],
    mv_letter_favorites: [],
    mv_rating_history: [],
  };
  const receipts = new Map();
  let uploadFailures = 0,
    uploadAttempts = 0;
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64",
  );
  const applyGates: {
    kind: string;
    entered: () => void;
    wait: Promise<void>;
  }[] = [];
  function pauseNextApply(kind: string) {
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    applyGates.push({ kind, entered, wait });
    return { started, release };
  }

  const jwt = (id: string) =>
    [
      Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
        "base64url",
      ),
      Buffer.from(
        JSON.stringify({
          sub: id,
          role: "authenticated",
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000),
          aud: "authenticated",
          email: id === anton ? "anton@example.test" : "tanya@example.test",
        }),
      ).toString("base64url"),
      "contract-test-signature",
    ].join(".");
  const user = (id: string) => ({
    id,
    aud: "authenticated",
    role: "authenticated",
    email: id === anton ? "anton@example.test" : "tanya@example.test",
    email_confirmed_at: now,
    confirmed_at: now,
    app_metadata: { provider: "email" },
    user_metadata: {},
    identities: [],
    created_at: now,
    updated_at: now,
  });
  const readGates: {
    table: string;
    entered: () => void;
    wait: Promise<void>;
  }[] = [];
  function pauseNextRead(table: string) {
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    readGates.push({ table, entered, wait });
    return { started, release };
  }
  async function connect(context: BrowserContext) {
    await context.route("http://127.0.0.1:54321/**", async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      const headers = {
        "Access-Control-Allow-Origin": request.headers().origin || "http://127.0.0.1:4175",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
        "Content-Type": "application/json",
      };
      const send = (data: unknown, status = 200) =>
        route.fulfill({ status, headers, body: JSON.stringify(data) });
      if (request.method() === "OPTIONS") return send({});
      let body: Record<string, any> = {};
      if (request.headers()["content-type"]?.includes("application/json"))
        body = request.postDataJSON() || {};
      const bearer = request.headers().authorization?.split(" ")[1];
      let id = anton;
      try {
        id = JSON.parse(
          Buffer.from(bearer!.split(".")[1], "base64url").toString(),
        ).sub;
      } catch {}
      if (url.pathname.endsWith("/otp")) return send({});
      if (url.pathname.endsWith("/verify") || url.pathname.endsWith("/token")) {
        id = body.email?.startsWith("tanya") ? tanya : anton;
        return send({
          access_token: jwt(id),
          refresh_token: "test-refresh-" + id,
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          token_type: "bearer",
          user: user(id),
        });
      }
      if (url.pathname.endsWith("/user")) return send(user(id));
      if (url.pathname.endsWith("/logout")) return send({});
      if (url.pathname.includes("/storage/v1/object/"))
        return route.fulfill({
          status: 200,
          headers: { ...headers, "Content-Type": "image/png" },
          body: png,
        });
      if (url.pathname.endsWith("/functions/v1/media-upload")) {
        if (body.action === "delete") {
          tables.mv_media = tables.mv_media.filter((m) => m.id !== body.id);
          tables.mv_media_links = tables.mv_media_links.filter(
            (m) => m.media_id !== body.id,
          );
          return send({ ok: true });
        }
        uploadAttempts++;
        if (uploadFailures > 0) {
          uploadFailures--;
          return send(
            { error: "Тест: загрузка прервана. Попробуйте ещё раз." },
            500,
          );
        }
        const mediaId = request
          .postData()
          ?.match(/name="id"\r?\n\r?\n([^\r\n]+)/)?.[1];
        const media = tables.mv_media.find(
          (m) => m.id === mediaId && m.author_id === id,
        );
        if (!media) return send({ error: "MEDIA_NOT_FOUND" }, 400);
        media.ready = true;
        return send({ ok: true, id: media.id });
      }
      if (url.pathname.includes("/rpc/")) {
        const name = url.pathname.split("/").pop();
        if (name === "mv_join_status")
          return send({
            can_create:
              id === anton && !tables.mv_members.some((m) => m.user_id === id),
            invitation_id:
              recoverInvitation &&
              id === tanya &&
              !tables.mv_members.some((m) => m.user_id === id)
                ? "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
                : null,
          });
        if (
          name === "mv_accept_email_invite" &&
          recoverInvitation &&
          id === tanya &&
          body.p_id === "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
        ) {
          if (tables.mv_members.some((m) => m.user_id === tanya))
            return send({ message: "ALREADY_MEMBER" }, 400);
          tables.mv_members.push({
            family_id: family,
            user_id: tanya,
            role: "tanya",
            joined_at: now,
          });
          return send(family);
        }
        if (name === "mv_update_profile") {
          const p = body.p;
          if (p.welcome_seen) profiles.get(id)!.welcome_seen_at = now;
          if (p.onboarding_seen) profiles.get(id)!.onboarding_seen_at = now;
          for (const [key, v] of Object.entries(p))
            if (!["welcome_seen", "onboarding_seen"].includes(key))
              (profiles.get(id) as any)[key] = v;
          return send(null);
        }
        if (name === "mv_import_legacy")
          return send({
            ok: true,
            entries: Object.keys(body.p_records).length,
          });
        if (name === "mv_claim_legacy") return send(0);
        if (name === "mv_export")
          return send({
            app: "our-marvel-family",
            version: 2,
            userId: id,
            familyId: family,
            letters: tables.mv_letters,
            ratings: tables.mv_ratings,
            messages: tables.mv_messages,
          });
        if (name === "mv_prepare_media") {
          const existing = tables.mv_media.find((m) => m.id === body.p_id);
          if (existing) return send(existing.object_path);
          const object_path = family + "/" + body.p_id + ".jpg";
          tables.mv_media.push({
            id: body.p_id,
            family_id: family,
            author_id: id,
            kind: body.p_kind,
            target_id: body.p_target,
            object_path,
            content_type: body.p_type,
            byte_size: body.p_size,
            ready: false,
            created_at: new Date().toISOString(),
          });
          return send(object_path);
        }
        if (name === "mv_apply") {
          if (receipts.has(body.p_id)) return send(receipts.get(body.p_id));
          const gateIndex = applyGates.findIndex((g) => g.kind === body.p_kind);
          if (gateIndex >= 0) {
            const [gate] = applyGates.splice(gateIndex, 1);
            gate.entered();
            await gate.wait;
          }
          const kind = body.p_kind,
            p = body.p_payload,
            target = body.p_target;
          if (
            watchConfirmation &&
            ((kind === "entry" && typeof p.watched === "boolean") ||
              kind === "episode" ||
              kind.startsWith("watch_"))
          ) {
            let request = kind.startsWith("watch_")
              ? tables.mv_watch_requests.find((r) => r.id === target)
              : tables.mv_watch_requests.find(
                  (r) =>
                    r.project_id === target &&
                    r.season === (p.season || 0) &&
                    r.episode === (p.episode || 0),
                );
            if (kind.startsWith("watch_") && !request)
              return send({ message: "FORBIDDEN" }, 403);
            const project = request?.project_id || target;
            const season = request?.season || p.season || 0,
              episode = request?.episode || p.episode || 0;
            const rows = season ? tables.mv_episodes : tables.mv_entries;
            let row = rows.find(
              (r) =>
                r.project_id === project &&
                (!season || (r.season === season && r.episode === episode)),
            );
            const base = row?.version || 0;
            if (!row) {
              row = {
                family_id: family,
                project_id: project,
                season,
                episode,
                watched: false,
                watched_date: null,
                note: "",
                version: 1,
                updated_by: id,
                updated_at: now,
              };
              rows.push(row);
            }
            const notify = (recipient: string, type: string) =>
              tables.mv_notifications.push({
                id: crypto.randomUUID(),
                family_id: family,
                recipient_id: recipient,
                type,
                title:
                  type === "watch_request"
                    ? "Подтвердим, что посмотрели вместе?"
                    : "Просмотр подтверждён ❤️",
                route: "/project/" + project,
                dedupe_key: crypto.randomUUID(),
                read_at: null,
                created_at: now,
              });
            let status = "pending";
            if (kind.startsWith("watch_")) {
              if (kind === "watch_confirm" && request.requested_by === id)
                return send({ message: "PARTNER_CONFIRMS" }, 403);
              if (
                request.status !== "pending" ||
                request.version !== body.p_expected
              )
                status = "obsolete";
              else if (kind === "watch_confirm") {
                row.watched = true;
                row.watched_date = request.proposed_date;
                row.version++;
                request.status = "confirmed";
                request.confirmed_by = id;
                request.version++;
                notify(request.requested_by, "watch_confirmed");
                status = "confirmed";
              } else {
                row.watched = false;
                row.version++;
                request.status =
                  kind === "watch_cancel" ? "cancelled" : "rejected";
                request.base_version = row.version;
                request.version++;
                status = request.status;
              }
            } else if (!p.watched) {
              row.watched = false;
              row.watched_date = null;
              row.version++;
              if (request) {
                request.status = "cancelled";
                request.base_version = row.version;
                request.version++;
              }
              status = "cancelled";
            } else if (row.watched) status = "already_confirmed";
            else if (request?.status === "pending") status = "pending";
            else {
              request = {
                id: crypto.randomUUID(),
                family_id: family,
                project_id: project,
                season,
                episode,
                requested_by: id,
                confirmed_by: null,
                status: "pending",
                version: (request?.version || 0) + 1,
                base_version: base,
                requested_at: now,
                responded_at: null,
                proposed_date: p.watched_date || now.slice(0, 10),
              };
              tables.mv_watch_requests = tables.mv_watch_requests.filter(
                (r) =>
                  !(
                    r.project_id === project &&
                    r.season === season &&
                    r.episode === episode
                  ),
              );
              tables.mv_watch_requests.push(request);
              notify(id === anton ? tanya : anton, "watch_request");
            }
            const result = {
              ok: true,
              id: target,
              version: row.version,
              watch_status: status,
              request_id: request?.id,
            };
            receipts.set(body.p_id, result);
            return send(result);
          }
          // Contract semantics only; hosted SQL tests verify authorization and atomicity.
          if (
            ["message", "moment", "moment_attach"].includes(kind) &&
            p.media_ids?.length
          ) {
            const files = p.media_ids.map((mid: string) =>
              tables.mv_media.find((m) => m.id === mid && m.ready),
            );
            if (files.some((m: any) => !m))
              return send({ message: "MEDIA_NOT_READY" }, 400);
          }
          if (kind === "session") {
            let current = tables.mv_sessions.find((s) => s.id === target);
            if (
              !current &&
              tables.mv_sessions.some((s) => s.status === "active")
            )
              current = tables.mv_sessions.find((s) => s.status === "active");
            if (current) {
              if (!current.participants.includes(id))
                current.participants.push(id);
              if (p.status) current.status = p.status;
              if (p.status === "finished")
                current.finished_at = new Date().toISOString();
              if (p.film_minute != null) current.film_minute = p.film_minute;
              current.version++;
              const result = {
                ok: true,
                id: current.id,
                version: current.version,
                existing: true,
              };
              receipts.set(body.p_id, result);
              return send(result);
            }
          }
          let table = "",
            key = (r: any) => r.id === target;
          let newRow: any = {
            id: target,
            family_id: family,
            author_id: id,
            version: 1,
            created_at: new Date().toISOString(),
            ...p,
          };
          if (kind === "letter") {
            table = "mv_letters";
            newRow = {
              ...newRow,
              recipient_id: id === anton ? tanya : anton,
              delivered_at:
                p.status === "delivered" ? new Date().toISOString() : null,
              read_at: null,
            };
          }
          if (kind === "message") {
            table = "mv_messages";
            newRow = { ...newRow, edited_at: null, deleted_at: null };
          }
          if (kind === "event") table = "mv_events";
          if (kind === "session") {
            table = "mv_sessions";
            newRow = {
              ...newRow,
              status: p.status || "active",
              participants: [id],
              film_minute: 0,
              season: p.season ?? null,
              episode: p.episode ?? null,
              finished_at: null,
            };
          }
          if (kind === "moment") table = "mv_moments";
          if (kind === "rating") {
            table = "mv_ratings";
            key = (r) =>
              r.user_id === id &&
              r.project_id === target &&
              r.season === (p.season || 0);
            newRow = {
              family_id: family,
              user_id: id,
              project_id: target,
              season: 0,
              score: null,
              favorite: false,
              version: 1,
              ...p,
            };
          }
          if (kind === "entry") {
            table = "mv_entries";
            key = (r) => r.project_id === target;
            newRow = {
              family_id: family,
              project_id: target,
              watched: false,
              watched_date: null,
              note: "",
              version: 1,
              ...p,
            };
          }
          if (kind === "episode") {
            table = "mv_episodes";
            key = (r) =>
              r.project_id === target &&
              r.season === p.season &&
              r.episode === p.episode;
            newRow = {
              family_id: family,
              project_id: target,
              version: 1,
              ...p,
            };
          }
          let version = 0;
          if (table) {
            const i = tables[table].findIndex(key);
            const old = tables[table][i];
            if ((old?.version || 0) !== body.p_expected)
              return send({ code: "40001", message: "VERSION_CONFLICT" }, 409);
            version = (old?.version || 0) + 1;
            if (i < 0) tables[table].push(newRow);
            else tables[table][i] = { ...old, ...p, version };
          }
          if (
            ["message", "moment", "moment_attach"].includes(kind) &&
            p.media_ids?.length
          ) {
            for (const media_id of p.media_ids) {
              const linkKind = kind === "message" ? "message" : "moment";
              if (
                !tables.mv_media_links.some(
                  (l) =>
                    l.media_id === media_id &&
                    l.kind === linkKind &&
                    l.target_id === target,
                )
              )
                tables.mv_media_links.push({
                  media_id,
                  kind: linkKind,
                  target_id: target,
                  family_id: family,
                  author_id: id,
                  created_at: new Date().toISOString(),
                });
            }
          }
          if (kind === "letter_read") {
            const l = tables.mv_letters.find((l) => l.id === target);
            if (l && profiles.get(id)?.read_receipts) l.read_at = now;
          }
          if (kind === "letter_favorite") {
            if (p.value)
              tables.mv_letter_favorites.push({
                letter_id: target,
                user_id: id,
              });
            else
              tables.mv_letter_favorites = tables.mv_letter_favorites.filter(
                (x) => x.letter_id !== target || x.user_id !== id,
              );
          }
          if (kind === "letter_delete")
            tables.mv_letters = tables.mv_letters.filter(
              (l) => l.id !== target,
            );
          if (kind === "message_delete") {
            const m = tables.mv_messages.find((m) => m.id === target);
            if (m) {
              m.deleted_at = now;
              m.body = "Сообщение удалено";
              m.version++;
            }
          }
          if (kind === "reaction") {
            if (p.value)
              tables.mv_reactions.push({
                family_id: family,
                user_id: id,
                kind: p.kind,
                target_id: target,
                emoji: p.emoji,
              });
            else
              tables.mv_reactions = tables.mv_reactions.filter(
                (r) =>
                  !(
                    r.user_id === id &&
                    r.kind === p.kind &&
                    r.target_id === target &&
                    r.emoji === p.emoji
                  ),
              );
          }
          const result = { ok: true, id: target, version };
          receipts.set(body.p_id, result);
          return send(result);
        }
        return send(null);
      }
      const table = url.pathname.split("/").pop()!;
      if (table === "mv_profiles") return send([profiles.get(id)]);
      if (table === "mv_welcome")
        return send(
          id === tanya
            ? [
                {
                  family_id: family,
                  scenes: [
                    "Тестовая сцена 1",
                    "Тестовая сцена 2",
                    "Тестовая сцена 3",
                  ],
                  body: "Тестовое приватное письмо.\n\nТекст для проверки интерфейса.",
                },
              ]
            : [],
        );
      let rows = tables[table] || [];
      if (table === "mv_letters")
        rows = rows.filter(
          (l) =>
            l.author_id === id ||
            (l.recipient_id === id && l.status === "delivered"),
        );
      if (table === "mv_media")
        rows = rows.filter(
          (m) =>
            m.author_id === id ||
            m.kind !== "staged" ||
            tables.mv_media_links.some((l) => l.media_id === m.id),
        );
      if (table === "mv_notifications")
        rows = rows.filter((n) => n.recipient_id === id);
      if (table === "mv_letter_favorites")
        rows = rows.filter((r) => r.user_id === id);
      const index = readGates.findIndex((g) => g.table === table);
      if (index >= 0) {
        const captured = structuredClone(rows);
        const [gate] = readGates.splice(index, 1);
        gate.entered();
        await gate.wait;
        return send(captured);
      }
      return send(rows);
    });
  }
  return {
    connect,
    tables,
    profiles,
    anton,
    tanya,
    pauseNextRead,
    pauseNextApply,
    failNextUploads: (count = 1) => {
      uploadFailures = count;
    },
    uploadAttempts: () => uploadAttempts,
  };
}
