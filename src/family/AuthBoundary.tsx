import { useEffect, useRef, useState, type ReactNode } from "react";
import { Heart, Mail, LockKeyhole, ArrowRight, LogOut } from "lucide-react";
import { useFamily } from "./FamilyProvider";
import { supabase, appURL, errorText } from "./client";
const fragment = new URLSearchParams(location.hash.slice(1));
if (fragment.has("invite")) {
  const token = fragment.get("invite")!;
  sessionStorage.setItem("mv-invitation", token);
  // The email confirmation can open another Safari tab. Keep the same
  // email-bound, one-use invitation available there for at most seven days.
  localStorage.setItem(
    "mv-pending-invitation",
    JSON.stringify({ token, expires: Date.now() + 7 * 86400000 }),
  );
  history.replaceState(null, "", location.pathname + location.search);
}
export function AuthBoundary({ children }: { children: ReactNode }) {
  const family = useFamily();
  const [email, setEmail] = useState(""),
    [code, setCode] = useState(""),
    [password, setPassword] = useState(""),
    [passwordMode, setPasswordMode] = useState(false),
    [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [joinStatus, setJoinStatus] = useState<{
      can_create: boolean;
      invitation_id: string | null;
    } | null>(null),
    [joinError, setJoinError] = useState(""),
    [joining, setJoining] = useState(false);
  const attemptedInvitation = useRef<string | null>(null);
  useEffect(() => {
    attemptedInvitation.current = null;
  }, [family.user?.id]);
  useEffect(() => {
    const id = joinStatus?.invitation_id;
    if (
      !id ||
      !family.user ||
      !family.ready ||
      family.familyId ||
      family.offline ||
      family.localMode
    )
      return;
    if (attemptedInvitation.current === id) return;
    attemptedInvitation.current = id;
    setJoining(true);
    setMessage("");
    // Opening the private invitation and confirming its recipient identity is
    // enough: do not ask the partner to create a family or accept it again.
    void (async () => {
      try {
        await family.rpc("mv_accept_email_invite", { p_id: id });
        sessionStorage.removeItem("mv-invitation");
        localStorage.removeItem("mv-pending-invitation");
        await family.refresh();
      } catch (error) {
        // A second tab may already have consumed this single-use invitation.
        // Refresh membership before presenting a retry; do not duplicate it.
        await family.refresh();
        setMessage(errorText(error));
      } finally {
        setJoining(false);
      }
    })();
  }, [
    joinStatus?.invitation_id,
    family.user?.id,
    family.ready,
    family.familyId,
    family.offline,
    family.localMode,
    family.rpc,
    family.refresh,
  ]);
  useEffect(() => {
    if (
      !supabase ||
      !family.user ||
      !family.ready ||
      family.familyId ||
      family.localMode
    )
      return;
    let active = true;
    setJoinStatus(null);
    setJoinError("");
    if (family.offline) {
      setJoinError("Для принятия приглашения подключитесь к интернету.");
      return;
    }
    void supabase.rpc("mv_join_status").then(({ data, error }) => {
      if (!active) return;
      if (error) setJoinError(errorText(error));
      else {
        setJoinStatus(data);
        // Another tab may have joined after our initial snapshot was read.
        if (!data?.invitation_id && !data?.can_create) void family.refresh();
      }
    });
    return () => {
      active = false;
    };
  }, [
    family.user?.id,
    family.ready,
    family.familyId,
    family.offline,
    family.localMode,
  ]);
  if (!supabase || family.localMode) return <>{children}</>;
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  if (family.user && !family.ready)
    return (
      <div className="universe-loading">
        <span className="little-heart">♡</span>
        <p>Открываем нашу вселенную…</p>
      </div>
    );
  if (family.user && family.familyId) return <>{children}</>;
  if (family.user && (joining || (joinStatus?.invitation_id && !message)))
    return (
      <div className="universe-loading">
        <span className="little-heart">♡</span>
        <p>Открываем нашу вселенную…</p>
      </div>
    );
  let invitation = sessionStorage.getItem("mv-invitation");
  if (!invitation) {
    try {
      const pending = JSON.parse(
        localStorage.getItem("mv-pending-invitation") || "null",
      );
      if (pending?.expires > Date.now() && /^[a-f0-9]{64}$/.test(pending.token))
        invitation = pending.token;
      else localStorage.removeItem("mv-pending-invitation");
    } catch {
      localStorage.removeItem("mv-pending-invitation");
    }
  }
  return (
    <main className="auth-page">
      <div className="auth-stars" aria-hidden="true" />
      <div className="auth-card">
        <div className="brand">
          НАШ <b>MARVEL</b>
        </div>
        <div className="auth-heart">
          <Heart size={38} />
        </div>
        <h1>
          Наша маленькая
          <br />
          <span>вселенная</span>
        </h1>
        <p>
          Только мы. Наши истории.
          <br />И всё, что хочется сохранить.
        </p>
        {!family.user ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                if (passwordMode) {
                  const { error } = await supabase!.auth.signInWithPassword({
                    email,
                    password,
                  });
                  if (error) throw error;
                  setPassword("");
                } else if (sent) {
                  const { error } = await supabase!.auth.verifyOtp({
                    email,
                    token: code.trim(),
                    type: "email",
                  });
                  if (error) throw error;
                } else {
                  const { error } = await supabase!.auth.signInWithOtp({
                    email,
                    options: {
                      emailRedirectTo: appURL(),
                      shouldCreateUser: true,
                    },
                  });
                  if (error) throw error;
                  setSent(true);
                  setMessage(
                    "Проверьте почту. Введите код из письма или откройте ссылку на этом iPhone.",
                  );
                }
              });
            }}
          >
            <label>
              Ваш email
              <input
                aria-label="Email для входа"
                type="email"
                autoComplete="email"
                required
                value={email}
                disabled={busy || sent}
                onChange={(e) => setEmail(e.target.value.trim())}
              />
            </label>
            {passwordMode && (
              <label>
                Пароль
                <input
                  aria-label="Пароль для входа"
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={128}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <small>
                  Пароль можно задать после первого входа по письму: «Наши
                  профили и приглашение» → «Вход с иконки iPhone».
                </small>
              </label>
            )}
            {sent && !passwordMode && (
              <label>
                Код из письма
                <input
                  aria-label="Код подтверждения"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  minLength={6}
                  maxLength={12}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </label>
            )}
            <button className="primary" disabled={busy}>
              {busy
                ? "Подождите…"
                : passwordMode
                  ? "Войти по паролю"
                  : sent
                    ? "Войти в нашу вселенную"
                    : "Получить письмо для входа"}
              <ArrowRight size={17} />
            </button>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                setPasswordMode(!passwordMode);
                setSent(false);
                setCode("");
                setPassword("");
                setMessage("");
              }}
            >
              {passwordMode ? "Войти по письму" : "Войти по паролю"}
            </button>
            {sent && !passwordMode && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setSent(false);
                  setCode("");
                }}
              >
                Другой email / отправить снова
              </button>
            )}
          </form>
        ) : (
          <div className="family-join">
            <div className="account-email">
              <Mail size={16} />
              {family.user.email}
            </div>
            {invitation || joinStatus?.invitation_id ? (
              <>
                <p>
                  Вы получили личное приглашение. Оно сработает только для
                  подтверждённого email получателя.
                </p>
                <button
                  className="primary"
                  disabled={busy || family.offline}
                  onClick={() =>
                    void run(async () => {
                      if (joinStatus?.invitation_id) {
                        await family.rpc("mv_accept_email_invite", {
                          p_id: joinStatus.invitation_id,
                        });
                      } else {
                        await family.rpc("mv_accept_invite", {
                          p_token: invitation,
                        });
                      }
                      sessionStorage.removeItem("mv-invitation");
                      localStorage.removeItem("mv-pending-invitation");
                      await family.refresh();
                    })
                  }
                >
                  Повторить вход ❤️
                </button>
              </>
            ) : joinStatus?.can_create ? (
              <>
                <p>
                  Создать семейное пространство может только заранее разрешённый
                  аккаунт Антона. Для Тани нужна одноразовая ссылка-приглашение.
                </p>
                <button
                  className="primary"
                  disabled={busy || family.offline}
                  onClick={() =>
                    void run(async () => {
                      await family.rpc("mv_create_family");
                      await family.refresh();
                    })
                  }
                >
                  Создать нашу вселенную
                </button>
              </>
            ) : (
              <p role="status">
                {joinError ||
                  (joinStatus
                    ? "Для этой почты пока нет действующего приглашения. Попросите Антона создать приглашение именно на этот адрес."
                    : "Ищем ваше приглашение…")}
              </p>
            )}
            <button
              className="text-button"
              onClick={() => void run(family.signOut)}
            >
              <LogOut size={14} />
              Выйти из аккаунта
            </button>
          </div>
        )}
        {(message || family.error) && (
          <p className="auth-message" role="status">
            {message || family.error}
          </p>
        )}
        <div className="privacy-line">
          <LockKeyhole size={13} />
          Доступ только двум подтверждённым аккаунтам
        </div>
        <button
          className="archive-link"
          onClick={() => family.setLocalMode(true)}
        >
          Открыть локальный архив первой версии
        </button>
      </div>
    </main>
  );
}
