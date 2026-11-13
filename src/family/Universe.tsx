import {Legend} from "../legend/Legend";
import { useEffect, useState } from "react";
import {
  Mail,
  MessageCircle,
  Camera,
  CalendarHeart,
  Play,
  Bell,
  Heart,
  ChevronRight,
  ArrowLeft,
  ShieldCheck,
  RefreshCw,
  Download,
  LogOut,
  Users,
  Star,
  PenLine,
  Settings,
} from "lucide-react";
import { catalog } from "../model";
import { useFamily } from "./FamilyProvider";
import { appURL, cloudConfigured, supabase } from "./client";
import { Letters } from "./Letters";
import { Chat } from "./Chat";
import { Moments } from "./Moments";
import { Calendar, NextEvening } from "./Calendar";
import { Notifications } from "./Notifications";
import { Sessions } from "./Sessions";
import { WelcomeLetter, Onboarding } from "./Welcome";
import { FamilyBackupPanel } from "./Backup";
import { PhotoUpload, PrivatePhoto } from "./media";
import { useAction, Feedback, Person, displayDate } from "./ui";
import { SyncDifference, actionName } from "./SyncDifference";
import { downloadJSON } from "./MigrationWizard";
type Route = { page: string; id?: string };
const parseRoute = (): Route => {
  const [page, id] = location.hash.replace(/^#\/?/, "").split("/");
  return { page: page || "home", id };
};
export function useFamilyRoute() {
  const [route, setRoute] = useState<Route>(parseRoute);
  useEffect(() => {
    const change = () => setRoute(parseRoute());
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  return route;
}
export function FamilyHomeCards() {
  const f = useFamily();
  if (!f.familyId || f.localMode) return null;
  const unread = f.snapshot.notifications.filter((n) => !n.read_at).length;
  const letter = f.snapshot.letters
    .filter((l) => l.recipient_id === f.user?.id && l.status === "delivered")
    .sort((a, b) =>
      (b.delivered_at || "").localeCompare(a.delivered_at || ""),
    )[0];
  const moment = [...f.snapshot.moments].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  )[0];
  return (
    <section className="family-home-cards">
      <div className="family-together">
        <div>
          <span className="avatar anton">А</span>
          <Heart size={14} />
          <span className="avatar tanya">Т</span>
        </div>
        <span>
          Антон и Таня<small>Наша маленькая вселенная</small>
        </span>
        <button
          onClick={() => (location.hash = "/universe")}
          aria-label="Открыть семейное пространство"
        >
          <ChevronRight size={21} />
        </button>
      </div>
      <NextEvening />
      <div className="home-social-links">
        <button onClick={() => (location.hash = "/chat")}>
          <MessageCircle size={22} />
          <span>
            Наш разговор
            <small>{unread ? `${unread} новых событий` : "Всегда рядом"}</small>
          </span>
        </button>
        <button
          onClick={() =>
            (location.hash = letter ? "/letters/" + letter.id : "/letters")
          }
        >
          <Mail size={22} />
          <span>
            Письма друг другу
            <small>{letter ? letter.title : "Место для тёплых слов"}</small>
          </span>
        </button>
        {moment && (
          <button onClick={() => (location.hash = "/moments/" + moment.id)}>
            <Camera size={22} />
            <span>
              Наш последний момент
              <small>{moment.caption || "Немного нашего счастья"}</small>
            </span>
          </button>
        )}
      </div>
    </section>
  );
}
export function Universe({ onProject }: { onProject: (id: string) => void }) {
  const f = useFamily(),
    a = useAction();
  const route = useFamilyRoute();
  const [replay, setReplay] = useState<"letter" | "tour" | null>(null),
    [inviteEmail, setInviteEmail] = useState(""),
    [inviteLink, setInviteLink] = useState(""),
    [newPassword, setNewPassword] = useState(""),
    [repeatPassword, setRepeatPassword] = useState("");
  if (!cloudConfigured || f.localMode)
    return (
      <section className="panel universe-setup">
        <Heart className="gold" size={36} />
        <h1>Наша маленькая вселенная</h1>
        <p>
          {cloudConfigured
            ? "Сейчас открыт локальный архив первой версии. Облачные данные доступны только после подтверждённого входа."
            : "Семейное пространство подключается к приватному Supabase. Старый дневник и ваши локальные записи продолжают работать."}
        </p>
        {cloudConfigured ? (
          <button className="primary" onClick={() => f.setLocalMode(false)}>
            Войти в семейное пространство
          </button>
        ) : (
          <p className="muted">
            Авторизация и сервер ещё не настроены. Чат, письма, фотографии и
            push не имитируются.
          </p>
        )}
      </section>
    );
  if (replay === "letter")
    return <WelcomeLetter onDone={() => setReplay(null)} />;
  if (replay === "tour")
    return (
      <Onboarding
        onDone={() => setReplay(null)}
        onNotifications={() => {
          setReplay(null);
          location.hash = "/settings/notifications";
        }}
      />
    );
  const back = (
    <button
      className="text-button family-back"
      onClick={() => (location.hash = "/universe")}
    >
      <ArrowLeft size={16} />
      Наша вселенная
    </button>
  );
  if (route.page === "legend") return <>{back}<Legend onProject={onProject}/></>;
  if (route.page === "letters")
    return (
      <>
        {back}
        <Letters key={route.id || "all"} initialId={route.id} />
      </>
    );
  if (route.page === "chat")
    return (
      <>
        {back}
        <Chat />
      </>
    );
  if (route.page === "project" && route.id) {
    return (
      <>
        {back}
        <button className="wide-button" onClick={() => onProject(route.id!)}>
          Открыть карточку {catalog.find((p) => p.id === route.id)?.title}
        </button>
        <Chat
          scope="project"
          target={route.id}
          title={catalog.find((p) => p.id === route.id)?.title || "Наш фильм"}
        />
      </>
    );
  }
  if (route.page === "moments")
    return (
      <>
        {back}
        <Moments />
      </>
    );
  if (route.page === "events")
    return (
      <>
        {back}
        <Calendar
          key={route.id || "all"}
          initialProject={
            route.id?.startsWith("new-") ? route.id.slice(4) : undefined
          }
        />
      </>
    );
  if (route.page === "sessions")
    return (
      <>
        {back}
        <Sessions
          key={route.id || "all"}
          initialId={route.id}
          onRate={onProject}
        />
      </>
    );
  if (route.page === "settings" && route.id === "notifications")
    return (
      <>
        {back}
        <Notifications />
      </>
    );
  if (route.page === "backup")
    return (
      <>
        {back}
        <FamilyBackupPanel />
      </>
    );
  if (route.page === "sync")
    return (
      <>
        {back}
        <section className="panel sync-panel">
          <h1>Всё на своих местах</h1>
          <p>
            {f.offline
              ? "Без сети: действия остаются на этом устройстве."
              : "Синхронизируем только после подтверждения сервера."}
          </p>
          <button className="wide-button" onClick={() => void a.run(f.retry)}>
            <RefreshCw size={17} />
            Повторить отправку очереди
          </button>
          <button
            className="wide-button"
            onClick={() =>
              downloadJSON(
                {
                  app: "our-marvel-outbox",
                  version: 1,
                  userId: f.user!.id,
                  operations: f.operations,
                },
                "our-marvel-pending-actions.json",
              )
            }
          >
            <Download size={17} />
            Экспортировать ожидающие действия
          </button>
          {f.operations.map((o) => (
            <article className="pending-operation" key={o.id}>
              <h3>
                {actionName(o.kind)} ·{" "}
                {catalog.find((p) => p.id === o.target)?.title || o.target}
              </h3>
              <p>{o.state === "queued" ? "Ожидает отправки" : o.error}</p>
              <SyncDifference op={o} snapshot={f.serverSnapshot} />
              <details>
                <summary>Подробности изменения</summary>
                <pre>{JSON.stringify(o.payload, null, 2)}</pre>
              </details>
              {o.state !== "queued" && (
                <>
                  <p className="muted">
                    Автоматического перезаписывания нет. Сохраните этот вариант,
                    затем снимите конфликт и повторите изменение по актуальным
                    данным.
                  </p>
                  <button
                    className="danger-button"
                    onClick={() => {
                      if (
                        confirm(
                          "Убрать это действие из очереди? Его содержимое останется только в вашей экспортированной копии.",
                        )
                      )
                        void a.run(() => f.discard(o.id));
                    }}
                  >
                    Оставить серверную версию
                  </button>
                </>
              )}
            </article>
          ))}
          {!f.operations.length && (
            <p className="gold">Всё синхронизировано ♡</p>
          )}
          <Feedback text={a.feedback} />
        </section>
      </>
    );
  if (route.page === "preferences")
    return (
      <>
        {back}
        <section className="panel family-form">
          <h1>Только наше</h1>
          <div className="account-email">{f.user?.email}</div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void a.run(async () => {
                if (newPassword !== repeatPassword)
                  throw Error("Пароли не совпадают.");
                if (newPassword.length < 12)
                  throw Error("Используйте пароль от 12 символов.");
                const { error } = await supabase!.auth.updateUser({
                  password: newPassword,
                });
                if (error) throw error;
                setNewPassword("");
                setRepeatPassword("");
                a.setFeedback(
                  "Пароль сохранён. Теперь с иконки можно выбрать «Войти по паролю».",
                );
              });
            }}
          >
            <h2>Вход с иконки iPhone</h2>
            <p>
              Задайте пароль для своей подтверждённой почты. Он позволит войти в
              установленное приложение и на новом устройстве.
            </p>
            <label>
              Новый пароль
              <input
                aria-label="Новый пароль"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </label>
            <label>
              Повторите пароль
              <input
                aria-label="Повторите пароль"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
                value={repeatPassword}
                onChange={(e) => setRepeatPassword(e.target.value)}
              />
            </label>
            <button className="wide-button" disabled={a.busy || f.offline}>
              Сохранить пароль для входа
            </button>
          </form>
          <h2>Мой аватар</h2>
          {f.snapshot.media
            .filter(
              (m) =>
                m.kind === "avatar" && m.author_id === f.user?.id && m.ready,
            )
            .map((m) => (
              <PrivatePhoto key={m.id} media={m} />
            ))}
          <PhotoUpload kind="avatar" target={null} />
          <label className="toggle-row">
            <span>Показывать партнёру «Прочитано» у писем</span>
            <input
              type="checkbox"
              checked={f.snapshot.profile?.read_receipts || false}
              onChange={(e) =>
                void a.run(async () => {
                  await f.rpc("mv_update_profile", {
                    p: { read_receipts: e.target.checked },
                  });
                  await f.refresh();
                })
              }
            />
          </label>
          {f.role === "tanya" && (
            <button className="wide-button" onClick={() => setReplay("letter")}>
              <Heart size={17} />
              Посмотреть письмо от Антона ❤️
            </button>
          )}
          <button className="wide-button" onClick={() => setReplay("tour")}>
            Знакомство с приложением
          </button>
          <button
            className="wide-button"
            onClick={() => (location.hash = "/settings/notifications")}
          >
            <Bell size={17} />
            Уведомления и устройства
          </button>
          <button
            className="wide-button"
            onClick={() => (location.hash = "/backup")}
          >
            <ShieldCheck size={17} />
            Копии, перенос и удаление данных
          </button>
          {f.role === "anton" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void a.run(async () => {
                  const token = await f.rpc<string>("mv_invite", {
                    p_email: inviteEmail,
                  });
                  setInviteLink(
                    appURL() + "#invite=" + encodeURIComponent(token),
                  );
                });
              }}
            >
              <h2>Пригласить Таню</h2>
              <p>
                Одноразовая ссылка действует 7 дней и только для указанного
                подтверждённого email. Создание новой ссылки отменяет старую.
              </p>
              <label>
                Email Тани
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </label>
              <button
                className="primary"
                disabled={
                  a.busy || f.offline || f.snapshot.members.length === 2
                }
              >
                Создать приглашение
              </button>
              {inviteLink && (
                <div className="invitation-result">
                  <p>
                    Передайте эту ссылку Тане лично. Само приложение её никому
                    не отправляет.
                  </p>
                  <textarea
                    aria-label="Одноразовая ссылка приглашения"
                    readOnly
                    value={inviteLink}
                  />
                  <button
                    type="button"
                    className="wide-button"
                    onClick={() =>
                      void a.run(async () => {
                        await navigator.clipboard.writeText(inviteLink);
                        a.setFeedback("Ссылка скопирована");
                      })
                    }
                  >
                    Скопировать приглашение
                  </button>
                </div>
              )}
            </form>
          )}
          <button className="text-button" onClick={() => void a.run(f.signOut)}>
            <LogOut size={16} />
            Выйти на этом устройстве
          </button>
          <Feedback text={a.feedback} />
        </section>
      </>
    );
  const links = [
    {
      title: "Письма друг другу",
      text: "Маленькие признания. Большое «мы».",
      route: "/letters",
      icon: Mail,
      cls: "rose",
    },
    {
      title: "Наш разговор",
      text: "Про кино и про всё на свете.",
      route: "/chat",
      icon: MessageCircle,
      cls: "blue",
    },
    {
      title: "Наши моменты",
      text: "Фотографии, в которых мы счастливы.",
      route: "/moments",
      icon: Camera,
      cls: "gold",
    },
    {
      title: "Наши киновечера",
      text: "Время, которое мы выбрали друг для друга.",
      route: "/events",
      icon: CalendarHeart,
      cls: "rose",
    },
    {
      title: "Наша легенда", text: "Каждый фильм — новая глава нашей истории", route: "/legend", icon: Star, cls: "gold",
    },
    {
      title: "Смотрим вместе",
      text: "Наши реакции по ту сторону экрана.",
      route: "/sessions",
      icon: Play,
      cls: "blue",
    },
    {
      title: "Только наше",
      text: "Профили, приглашение и уведомления.",
      route: "/preferences",
      icon: Settings,
      cls: "gold",
    },
  ];
  const unread = f.snapshot.notifications
    .filter((n) => !n.read_at)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const differences = catalog
    .map((p) => {
      const rows = f.snapshot.ratings.filter(
        (r) => r.project_id === p.id && r.season === 0 && r.score !== null,
      );
      return {
        p,
        rows,
        gap: rows.length === 2 ? Math.abs(rows[0].score! - rows[1].score!) : -1,
      };
    })
    .filter((x) => x.gap >= 0)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 10);
  return (
    <div className="universe-page">
      <div className="universe-hero">
        <div className="eyebrow">ДВЕ ДУШИ · ОДНА ВСЕЛЕННАЯ</div>
        <div className="together-orbit">
          <span>А</span>
          <Heart size={26} />
          <span>Т</span>
        </div>
        <h1>
          Наше любимое
          <br />
          <span>место во вселенной.</span>
        </h1>
        <p>Кино — только повод побыть вместе.</p>
      </div>
      <NextEvening />
      <div className="universe-grid">
        {links.map((link) => (
          <button
            className={"universe-link " + link.cls}
            key={link.route}
            onClick={() => (location.hash = link.route)}
          >
            <link.icon size={28} />
            <h2>{link.title}</h2>
            <p>{link.text}</p>
            <ChevronRight size={17} />
          </button>
        ))}
      </div>
      {(f.operations.length > 0 || f.error) && (
        <button
          className="sync-summary"
          onClick={() => (location.hash = "/sync")}
        >
          <RefreshCw size={17} />
          {f.error || `Действий в очереди: ${f.operations.length}`}
          <ChevronRight size={16} />
        </button>
      )}
      {unread.length > 0 && (
        <section className="panel notification-inbox">
          <h2>В нашей вселенной</h2>
          {unread.slice(0, 10).map((n) => (
            <button
              key={n.id}
              onClick={() => {
                void a.run(() => f.mutate("notification_read", n.id, {}));
                location.hash = n.route;
              }}
            >
              <Bell size={17} />
              <div>
                {n.title}
                <small>{displayDate(n.created_at)}</small>
              </div>
              <ChevronRight size={16} />
            </button>
          ))}
        </section>
      )}
      <section className="panel">
        <h2>О чём мы поспорим после титров?</h2>
        <p>Истории с самой большой разницей наших оценок.</p>
        {differences.map(({ p, rows, gap }) => (
          <button
            className="difference-row"
            key={p.id}
            onClick={() => onProject(p.id)}
          >
            <span>
              {p.title}
              <small>
                {rows
                  .map(
                    (r) =>
                      `${f.snapshot.members.find((m) => m.user_id === r.user_id)?.role === "tanya" ? "Таня" : "Антон"}: ${r.score}`,
                  )
                  .join(" · ")}
              </small>
            </span>
            <b>Δ {gap}</b>
          </button>
        ))}
        {!differences.length && (
          <p className="muted">Появятся, когда оба оценят одну историю.</p>
        )}
      </section>
      <section className="panel">
        <h2>Наши любимые истории</h2>
        <div className="personal-favorites">
          {f.snapshot.members.map((member) => (
            <div key={member.user_id}>
              <Person id={member.user_id} />
              {f.snapshot.ratings
                .filter(
                  (r) =>
                    r.user_id === member.user_id &&
                    r.season === 0 &&
                    r.favorite,
                )
                .map((r) => (
                  <button
                    key={r.project_id}
                    onClick={() => onProject(r.project_id)}
                  >
                    <Heart size={13} />
                    {catalog.find((p) => p.id === r.project_id)?.title}
                  </button>
                ))}
            </div>
          ))}
        </div>
      </section>
      <Feedback text={a.feedback} />
    </div>
  );
}
