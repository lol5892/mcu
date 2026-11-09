// Browser contract fixture only. This is not a Supabase Auth/Realtime service.
// Real PostgreSQL authorization is tested separately in supabase/tests/security.sql.
import type { BrowserContext, Route } from "@playwright/test";
const anton = "11111111-1111-4111-8111-111111111111",
  tanya = "22222222-2222-4222-8222-222222222222",
  family = "99999999-9999-4999-8999-999999999999";
export const userIds = { anton, tanya };
export function fixture() {
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
    mv_reactions: [],
    mv_notifications: [],
    mv_devices: [],
    mv_legacy_ratings: [],
    mv_letter_favorites: [],
    mv_rating_history: [],
  };
  const receipts = new Map();
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
  async function connect(context: BrowserContext) {
    await context.route("http://127.0.0.1:54321/**", async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      const headers = {
        "Access-Control-Allow-Origin": "http://127.0.0.1:4175",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
        "Content-Type": "application/json",
      };
      const send = (data: unknown, status = 200) =>
        route.fulfill({ status, headers, body: JSON.stringify(data) });
      if (request.method() === "OPTIONS") return send({});
      const body = request.postDataJSON() || {};
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
      if (url.pathname.includes("/rpc/")) {
        const name = url.pathname.split("/").pop();
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
        if (name === "mv_apply") {
          if (receipts.has(body.p_id)) return send(receipts.get(body.p_id));
          const kind = body.p_kind,
            p = body.p_payload,
            target = body.p_target;
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
      if (table === "mv_letter_favorites")
        rows = rows.filter((r) => r.user_id === id);
      return send(rows);
    });
  }
  return { connect, tables, profiles, anton, tanya };
}
