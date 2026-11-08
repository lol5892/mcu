import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const cloudConfigured = Boolean(url && key);
export const supabase = cloudConfigured
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
      realtime: { params: { eventsPerSecond: 5 } },
    })
  : null;
export const appURL = () =>
  new URL(import.meta.env.BASE_URL, location.href).href;
export function errorText(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : String(error);
  const known: Record<string, string> = {
    VERSION_CONFLICT:
      "Изменено на другом устройстве. Сравните версии и повторите действие.",
    WELCOME_NOT_PROVISIONED:
      "Сначала нужно приватно настроить приветственное письмо на сервере.",
    OWNER_NOT_ALLOWED:
      "Этот подтверждённый email не разрешён для создания семьи.",
    EMAIL_NOT_CONFIRMED: "Подтвердите email кодом из письма.",
    INVITATION_INVALID:
      "Приглашение истекло, уже использовано или вы вошли с другим email.",
    FAMILY_FULL: "В нашей вселенной уже два участника.",
    PARTNER_NOT_JOINED: "Сначала пригласите второго участника.",
    WATCH_FIRST: "Сначала отметьте просмотр фильма или серии.",
    LETTER_NOT_EDITABLE: "Доставленное письмо нельзя переписывать.",
    SCHEDULE_IN_FUTURE: "Для отложенной отправки выберите будущее время.",
    EPISODE_NOT_RELEASED: "Эта серия ещё не вышла или отсутствует в каталоге.",
    RATE_LIMITED: "Подождите минуту перед повторной проверкой.",
    REMOVE_ATTACHMENTS_FIRST: "Сначала удалите прикреплённые фотографии.",
    FORBIDDEN: "Нет доступа к этому действию.",
  };
  return (
    Object.entries(known).find(([code]) => message.includes(code))?.[1] ||
    message
  );
}
