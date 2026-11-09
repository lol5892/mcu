import { enablePush } from "./push";
import { useState } from "react";
import { Bell, Smartphone, Send, VolumeX, Trash2 } from "lucide-react";
import { useFamily } from "./FamilyProvider";
import { useAction, Feedback, displayDate } from "./ui";
export const notificationKinds = [
  ["message", "Личные сообщения"],
  ["comment", "Комментарии"],
  ["rating", "Оценки"],
  ["photo", "Фотографии"],
  ["letter", "Письма ❤️"],
  ["event_invite", "Приглашения"],
  ["event_confirm", "Подтверждение киновечера"],
  ["event_move", "Перенос киновечера"],
  ["event_cancel", "Отмена киновечера"],
  ["session", "Совместные сеансы"],
  ["reminder", "Напоминания о просмотре"],
  ["nudge", "Предложение киновечера"],
  ["letter_nudge", "Написать тёплое письмо"],
] as const;
export function Notifications() {
  const f = useFamily(),
    a = useAction();
  const profile = f.snapshot.profile;
  const [quietStart, setQuietStart] = useState(
      profile?.quiet_start?.slice(0, 5) || "22:00",
    ),
    [quietEnd, setQuietEnd] = useState(
      profile?.quiet_end?.slice(0, 5) || "09:00",
    ),
    [timezone, setTimezone] = useState(
      profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    ),
    [hours, setHours] = useState(
      (profile?.reminder_hours || [24, 1]).join(", "),
    ),
    [testId, setTestId] = useState(""),
    [testStatus, setTestStatus] = useState("");
  async function preference(p: Record<string, unknown>) {
    await f.rpc("mv_update_profile", { p });
    await f.refresh();
  }
  return (
    <div className="notification-settings">
      <div className="page-heading">
        <div className="eyebrow">ДОСТАВЛЯЕМ ТОЛЬКО ВАЖНОЕ</div>
        <h1>Всегда на связи</h1>
        <p>
          Уведомления приходят через Web Push, даже когда приложение закрыто —
          если iPhone и настройки это позволяют.
        </p>
      </div>
      <section className="panel">
        <Bell className="gold" />
        <h2>На этом устройстве</h2>
        <p>
          На iPhone нужен iOS 16.4 или новее. Откройте установленное приложение
          с главного экрана. Системный запрос появится только после вашей
          кнопки.
        </p>
        <button
          className="primary"
          disabled={a.busy || f.offline}
          onClick={() =>
            void a.run(async () => {
              await enablePush(f.user!.id, f.rpc);
              await preference({
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                notification_types: {
                  ...profile?.notification_types,
                  enabled: true,
                },
              });
              a.setFeedback(
                "Подписка зарегистрирована. Отправьте тест и проверьте его на экране iPhone.",
              );
            })
          }
        >
          <Bell size={17} />
          Включить / восстановить push
        </button>
        <label className="toggle-row">
          <span>Все уведомления</span>
          <input
            type="checkbox"
            checked={profile?.notification_types.enabled || false}
            onChange={(e) =>
              void a.run(() =>
                preference({
                  notification_types: {
                    ...profile?.notification_types,
                    enabled: e.target.checked,
                  },
                }),
              )
            }
          />
        </label>
        <button
          className="wide-button"
          disabled={a.busy || f.offline}
          onClick={() =>
            void a.run(async () => {
              const id = await f.rpc<string>("mv_test_push");
              setTestId(id);
              a.setFeedback(
                "Тест поставлен в серверную очередь. Планировщик обычно обрабатывает её в течение минуты. Это ещё не подтверждение получения на iPhone.",
              );
            })
          }
        >
          <Send size={16} />
          Отправить настоящее тестовое уведомление
        </button>
        {testId && (
          <button
            className="text-button"
            onClick={() =>
              void a.run(async () => {
                const result = await f.rpc<{
                  queued: number;
                  accepted_by_push_service: number;
                  failed: number;
                }>("mv_push_status", { p_notification: testId });
                setTestStatus(
                  `В очереди: ${result.queued}. Принято push-сервисом: ${result.accepted_by_push_service}. Ошибок: ${result.failed}. Показ на экране проверьте сами.`,
                );
              })
            }
          >
            Проверить серверный статус
          </button>
        )}
        <Feedback text={testStatus} />
        <p className="muted">
          Текст личных писем и сообщений не выводится на заблокированный экран.
          Режим фокусирования iPhone и экономия энергии могут задерживать
          доставку.
        </p>
      </section>
      <section className="panel">
        <h2>О чём сообщать</h2>
        {notificationKinds.map(([key, label]) => (
          <label key={key} className="toggle-row">
            <span>{label}</span>
            <input
              type="checkbox"
              checked={profile?.notification_types[key] !== false}
              onChange={(e) =>
                void a.run(() =>
                  preference({
                    notification_types: {
                      ...profile?.notification_types,
                      [key]: e.target.checked,
                    },
                  }),
                )
              }
            />
          </label>
        ))}
      </section>
      <form
        className="panel family-form"
        onSubmit={(e) => {
          e.preventDefault();
          void a.run(async () => {
            const values = hours.split(",").map((x) => Number(x.trim()));
            if (
              values.length > 4 ||
              values.some((v) => !Number.isInteger(v) || v < 1 || v > 168)
            )
              throw Error("Укажите до 4 интервалов в часах от 1 до 168.");
            await preference({
              quiet_start: quietStart,
              quiet_end: quietEnd,
              timezone,
              reminder_hours: [...new Set(values)],
            });
            a.setFeedback("Тихие часы и интервалы сохранены на сервере.");
          });
        }}
      >
        <VolumeX className="gold" />
        <h2>Бережём наше время</h2>
        <div className="form-columns">
          <label>
            Не беспокоить с
            <input
              type="time"
              value={quietStart}
              onChange={(e) => setQuietStart(e.target.value)}
            />
          </label>
          <label>
            До
            <input
              type="time"
              value={quietEnd}
              onChange={(e) => setQuietEnd(e.target.value)}
            />
          </label>
        </div>
        <label>
          Часовой пояс
          <input
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            placeholder="Europe/Moscow"
          />
        </label>
        <label>
          Напоминать за столько часов
          <input
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder="24, 1"
          />
        </label>
        <button className="primary" disabled={a.busy || f.offline}>
          Сохранить настройки
        </button>
      </form>
      <section className="panel family-form">
        <h2>Иногда — повод побыть вместе</h2>
        <p>
          Только с вашего согласия, в разрешённые часы. Если просмотр уже
          запланирован, лишних предложений не будет.
        </p>
        <label>
          Предлагать киновечер
          <select
            value={profile?.nudge_frequency || 0}
            onChange={(e) =>
              void a.run(() =>
                preference({ nudge_frequency: Number(e.target.value) }),
              )
            }
          >
            <option value={0}>Выключено</option>
            <option value={1}>Не чаще раза в неделю</option>
            <option value={2}>До двух раз в неделю</option>
          </select>
        </label>
        <label className="toggle-row">
          <span>Редко напоминать о тёплом письме</span>
          <input
            type="checkbox"
            checked={profile?.letter_nudges || false}
            onChange={(e) =>
              void a.run(() => preference({ letter_nudges: e.target.checked }))
            }
          />
        </label>
      </section>
      <section className="panel">
        <h2>Наши устройства</h2>
        {f.snapshot.devices.map((d) => (
          <div className="device-row" key={d.id}>
            <Smartphone size={19} />
            <div>
              <strong>{d.name}</strong>
              <small>
                {d.enabled ? "Подключено" : "Выключено"} ·{" "}
                {displayDate(d.updated_at)}
              </small>
            </div>
            {d.enabled && (
              <button
                aria-label="Отключить устройство"
                onClick={() =>
                  void a.run(async () => {
                    await f.rpc("mv_disable_device", { p_id: d.id });
                    if (
                      localStorage.getItem("mv-device:" + f.user!.id) === d.id
                    ) {
                      const registration = await navigator.serviceWorker.ready;
                      await (
                        await registration.pushManager.getSubscription()
                      )?.unsubscribe();
                    }
                    await f.refresh();
                  })
                }
              >
                <Trash2 size={17} />
              </button>
            )}
          </div>
        ))}
        {!f.snapshot.devices.length && <p>Пока нет подписанных устройств.</p>}
      </section>
      <Feedback text={a.feedback} />
    </div>
  );
}
