import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Heart,
  ArrowRight,
  SkipForward,
  Film,
  Star,
  Camera,
  CalendarHeart,
  MessageCircle,
  Bell,
} from "lucide-react";
import { useFamily } from "./FamilyProvider";
import { errorText } from "./client";
import { enablePush } from "./push";
import { useAction, Feedback } from "./ui";
// Personal words come only from the RLS-protected server row. No copy of the
// private letter is bundled in the public GitHub Pages JavaScript or test files.
export function WelcomeLetter({ onDone }: { onDone: () => void }) {
  const { snapshot } = useFamily();
  const data = snapshot.welcome;
  const [step, setStep] = useState(0);
  if (!data)
    return (
      <div className="welcome-scene">
        <p>Письмо доступно Тане после входа и принятия приглашения.</p>
        <button className="primary" onClick={onDone}>
          Вернуться
        </button>
      </div>
    );
  const letterStep = data.scenes.length,
    finalStep = letterStep + 1;
  return (
    <div
      className="welcome-scene"
      role="dialog"
      aria-modal="true"
      aria-label="Личное письмо от Антона"
    >
      <div className="starlight" aria-hidden="true">
        {Array.from({ length: 20 }, (_, i) => (
          <i
            key={i}
            style={{
              left: `${(i * 37 + 11) % 100}%`,
              top: `${(i * 23 + 7) % 100}%`,
              animationDelay: `${i % 5}s`,
            }}
          />
        ))}
      </div>
      <div className="welcome-glow" aria-hidden="true" />
      <div
        className="welcome-progress"
        aria-label={`Экран ${step + 1} из ${finalStep + 1}`}
      >
        {Array.from({ length: finalStep + 1 }, (_, i) => (
          <span key={i} className={i <= step ? "active" : ""} />
        ))}
      </div>
      {step < letterStep && (
        <button className="skip-intro" onClick={() => setStep(letterStep)}>
          <SkipForward size={14} />К письму
        </button>
      )}
      <section
        key={step}
        className={
          "welcome-content " + (step === letterStep ? "personal-letter" : "")
        }
      >
        {step < letterStep ? (
          <>
            <div className="welcome-star">✦</div>
            <h1>{data.scenes[step]}</h1>
            <button
              className="welcome-next"
              aria-label="Продолжить письмо"
              onClick={() => setStep(step + 1)}
            >
              <ArrowRight size={24} />
            </button>
          </>
        ) : step === letterStep ? (
          <>
            <div className="letter-seal">
              <Heart size={24} />
            </div>
            <div className="personal-letter-text">
              {data.body.split("\n\n").map((p, i) => (
                <p key={i} style={{ animationDelay: `${i * 0.25}s` }}>
                  {p}
                </p>
              ))}
            </div>
            <button
              className="welcome-button"
              onClick={() => setStep(finalStep)}
            >
              Дальше
              <ArrowRight size={17} />
            </button>
          </>
        ) : (
          <>
            <Heart className="glowing-heart" size={70} fill="currentColor" />
            <div className="welcome-brand">НАШ MARVEL</div>
            <p className="welcome-subtitle">Наша маленькая вселенная ❤️</p>
            <button className="welcome-button" onClick={onDone}>
              Начнём наше приключение вместе ❤️
            </button>
          </>
        )}
      </section>
      <div className="welcome-footer">ТОЛЬКО ДЛЯ НАС ДВОИХ</div>
    </div>
  );
}
const tour = [
  {
    title: "Наши фильмы",
    body: "Здесь собраны фильмы и сериалы Marvel, которые мы будем смотреть вместе.",
    icon: Film,
  },
  {
    title: "Наши оценки",
    body: "Мы можем оценивать каждый фильм отдельно, сравнивать впечатления и создавать совместный рейтинг.",
    icon: Star,
  },
  {
    title: "Наши моменты",
    body: "Здесь мы будем сохранять фотографии, воспоминания и впечатления от наших вечеров.",
    icon: Camera,
  },
  {
    title: "Наши киновечера",
    body: "Планируем время просмотра, выбираем фильмы и создаём маленькие семейные традиции.",
    icon: CalendarHeart,
  },
  {
    title: "Всегда рядом",
    body: "Общаемся, отправляем друг другу письма и получаем напоминания.",
    icon: MessageCircle,
  },
];
export function Onboarding({
  onDone,
  onNotifications,
}: {
  onDone: () => void;
  onNotifications: () => void;
}) {
  const f = useFamily(),
    a = useAction();
  const [step, setStep] = useState(0);
  const item = tour[step];
  return (
    <div
      className="tour-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Знакомство с нашей вселенной"
    >
      <div className="tour-card">
        <div className="eyebrow">НАША МАЛЕНЬКАЯ ВСЕЛЕННАЯ</div>
        <div className="tour-illustration">
          <item.icon size={54} />
          <i />
          <i />
        </div>
        <div className="tour-count">0{step + 1} / 05</div>
        <h1>{item.title}</h1>
        <p>{item.body}</p>
        <div className="tour-dots">
          {tour.map((_, i) => (
            <button
              key={i}
              aria-label={`Экран ${i + 1}`}
              className={step === i ? "active" : ""}
              onClick={() => setStep(i)}
            />
          ))}
        </div>
        {step === 4 ? (
          <>
            <button
              className="wide-button"
              disabled={a.busy}
              onClick={() =>
                void a.run(async () => {
                  await enablePush(f.user!.id, f.rpc);
                  await f.rpc("mv_update_profile", {
                    p: {
                      timezone:
                        Intl.DateTimeFormat().resolvedOptions().timeZone,
                      notification_types: {
                        ...f.snapshot.profile?.notification_types,
                        enabled: true,
                      },
                    },
                  });
                  await f.refresh();
                  a.setFeedback(
                    "Уведомления подключены. Можно открыть нашу вселенную.",
                  );
                })
              }
            >
              <Bell size={17} />
              Включить уведомления
            </button>
            <button className="primary" onClick={onDone}>
              Открыть нашу вселенную
              <Heart size={17} />
            </button>
          </>
        ) : (
          <button className="primary" onClick={() => setStep(step + 1)}>
            Дальше
            <ArrowRight size={17} />
          </button>
        )}
        <Feedback text={a.feedback} />
        <button className="text-button" onClick={onDone}>
          Пройти позже
        </button>
      </div>
    </div>
  );
}
export function WelcomeGate({ children }: { children: ReactNode }) {
  const f = useFamily();
  const initialized = useRef(false);
  const [view, setView] = useState<"none" | "letter" | "tour">("none"),
    [failure, setFailure] = useState("");
  useEffect(() => {
    if (
      initialized.current ||
      !f.familyId ||
      f.localMode ||
      f.role !== "tanya" ||
      !f.snapshot.profile ||
      !f.snapshot.welcome
    )
      return;
    initialized.current = true;
    if (!f.snapshot.profile.welcome_seen_at) {
      void f
        .rpc("mv_update_profile", { p: { welcome_seen: true } })
        .then(() => setView("letter"))
        .catch((e) => {
          setFailure(errorText(e));
          initialized.current = false;
        });
    } else if (!f.snapshot.profile.onboarding_seen_at) setView("tour");
  }, [
    f.familyId,
    f.role,
    f.snapshot.profile?.welcome_seen_at,
    f.snapshot.welcome,
    f.localMode,
  ]);
  if (view === "letter")
    return <WelcomeLetter onDone={() => setView("tour")} />;
  if (view === "tour")
    return (
      <Onboarding
        onNotifications={() => {
          location.hash = "/settings/notifications";
          setView("none");
          void f.refresh();
        }}
        onDone={() => {
          void f
            .rpc("mv_update_profile", { p: { onboarding_seen: true } })
            .then(() => {
              setView("none");
              void f.refresh();
            })
            .catch((e) => setFailure(errorText(e)));
        }}
      />
    );
  return (
    <>
      {failure && (
        <div className="error-banner" role="alert">
          {failure}
        </div>
      )}
      {children}
    </>
  );
}
