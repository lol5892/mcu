export async function enablePush(
  userId: string,
  rpc: <T = unknown>(
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<T>,
) {
  if (
    !("Notification" in window) ||
    !("PushManager" in window) ||
    !("serviceWorker" in navigator)
  )
    throw Error(
      "Этот браузер не поддерживает Web Push. На iPhone нужен iOS 16.4+ и запуск с главного экрана.",
    );
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const installed =
    matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone;
  if (ios && !installed)
    throw Error(
      "На iPhone сначала добавьте сайт на главный экран через Safari и запустите с иконки.",
    );
  const vapid = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapid)
    throw Error(
      "Сервер уведомлений ещё не настроен. Разрешение пока не запрашиваем.",
    );
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw Error(
      "Уведомления не разрешены. Измените разрешение в настройках iPhone.",
    );
  const registration = await navigator.serviceWorker.ready;
  let sub = await registration.pushManager.getSubscription();
  if (!sub) {
    const padded = vapid.padEnd(Math.ceil(vapid.length / 4) * 4, "=");
    const raw = atob(padded.replaceAll("-", "+").replaceAll("_", "/"));
    const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
    sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: bytes.buffer,
    });
  }
  const key = "mv-device:" + userId;
  const id = localStorage.getItem(key) || crypto.randomUUID();
  localStorage.setItem(key, id);
  await rpc("mv_register_device", {
    p_id: id,
    p_name: ios ? "Мой iPhone" : "Мой браузер",
    p_subscription: sub.toJSON(),
  });
  return id;
}
