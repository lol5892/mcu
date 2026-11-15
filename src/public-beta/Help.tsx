import { useState } from "react";
import {
  Share,
  PlusSquare,
  Smartphone,
  Clapperboard,
  Users,
  Star,
  Trophy,
  Camera,
  CalendarHeart,
  Settings,
} from "lucide-react";
import { donationURL } from "./config";
export function standalone() {
  return (
    matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}
export function InstallHelp({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(!compact);
  if (standalone()) return null;
  const embedded = /Instagram|FBAN|FBAV/i.test(navigator.userAgent);
  return (
    <section className="beta-help">
      {compact && (
        <button className="text-button" onClick={() => setOpen(!open)}>
          <Smartphone size={18} />
          Установить на iPhone
        </button>
      )}
      {open && (
        <>
          <h2>Установите приложение на iPhone</h2>
          {embedded && (
            <p>
              Вы открыли ссылку во встроенном браузере. Скопируйте адрес и
              откройте его в Safari.
            </p>
          )}
          <ol className="install-steps">
            <li>
              <Smartphone size={20} />
              Откройте этот сайт в Safari.
            </li>
            <li>
              <Share size={20} />
              Нажмите «Поделиться».
            </li>
            <li>
              <PlusSquare size={20} />
              Выберите «На экран Домой».
            </li>
            <li>Нажмите «Добавить».</li>
            <li>Откройте приложение с появившейся иконки.</li>
          </ol>
          <small>
            Это веб-приложение, устанавливаемое из Safari. Загрузка из App Store
            не требуется.
          </small>
        </>
      )}
    </section>
  );
}
const steps = [
  {
    title: "Ваша маленькая киновселенная",
    body: "Выберите имя и создайте пространство. Оно доступно только вам и вашему партнёру.",
    icon: Users,
    route: "/preferences",
  },
  {
    title: "Пригласите партнёра",
    body: "Укажите его email в настройках. Покажите QR-код или передайте ссылку. Приглашение одноразовое и действует 15 минут; одна сеть Wi-Fi не нужна.",
    icon: Users,
    route: "/preferences",
  },
  {
    title: "Выберите историю",
    body: "Откройте каталог, используйте поиск и фильтры. В карточке можно начать совместный просмотр и отметить «Посмотрели».",
    icon: Clapperboard,
    route: "/catalog",
  },
  {
    title: "Два мнения — одна история",
    body: "Каждый ставит свою оценку независимо от подтверждения просмотра. После титров оставьте до 200 символов впечатления.",
    icon: Star,
    route: "/catalog",
  },
  {
    title: "Собирайте легенду",
    body: "82 трофея, четыре уровня ценности и отдельный опыт каждого. Откройте награду, чтобы увидеть недостающие фильмы.",
    icon: Trophy,
    route: "/legend",
  },
  {
    title: "Сохраняйте вечера",
    body: "Добавляйте фото к сеансу или в «Наши моменты». В бете доступно 10 серверных фотографий на пару, включая аватары. Оригиналы сохраняйте у себя.",
    icon: Camera,
    route: "/moments",
  },
  {
    title: "Встреча после титров",
    body: "Планируйте киновечера в календаре. Уведомления включаются только по вашему желанию в настройках.",
    icon: CalendarHeart,
    route: "/events",
  },
  {
    title: "Всё под вашим контролем",
    body: "В настройках находятся имя, приглашение, помощь, экспорт и запросы удаления. Приложение бесплатно; добровольная поддержка появится только после подключения владельцем проверенной платёжной страницы.",
    icon: Settings,
    route: "/preferences",
  },
];
export function HelpTour({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const s = steps[step];
  return (
    <div
      className="tour-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Знакомство с приложением"
    >
      <section className="tour-card">
        <div className="eyebrow">КИНО ВДВОЁМ</div>
        <s.icon size={48} />
        <small>
          {step + 1} / {steps.length}
        </small>
        <h1>{s.title}</h1>
        <p>{s.body}</p>
        <button
          className="primary"
          onClick={() =>
            step < steps.length - 1 ? setStep(step + 1) : onDone()
          }
        >
          {step < steps.length - 1 ? "Дальше" : "Открыть нашу вселенную"}
        </button>
        <button
          className="text-button"
          onClick={() => {
            onDone();
            location.hash = s.route;
          }}
        >
          Попробовать
        </button>
        <button className="text-button" onClick={onDone}>
          Пропустить обучение
        </button>
      </section>
    </div>
  );
}
export function HelpPage() {
  const [tour, setTour] = useState(false);
  return (
    <section className="panel family-form">
      <h1>Помощь</h1>
      <InstallHelp />
      <button className="wide-button" onClick={() => setTour(true)}>
        Знакомство с приложением
      </button>
      <details>
        <summary>Нужна одна сеть Wi-Fi?</summary>
        <p>
          Нет. QR-код или ссылка соединяют аккаунты через интернет, даже из
          разных городов. Приглашение действует 15 минут и только для указанного
          подтверждённого email.
        </p>
      </details>
      <details>
        <summary>Почему оценка доступна до просмотра?</summary>
        <p>
          Оценки и впечатления личные, а просмотр — общий факт. Одно не отменяет
          другое.
        </p>
      </details>
      <details>
        <summary>Что будет без интернета?</summary>
        <p>
          Каталог и сохранённый прогресс доступны на этом устройстве.
          Поддерживаемые действия дождутся сети; регистрация и приглашение
          требуют соединения. Семейные фото не сохраняются в общий офлайн-кеш.
        </p>
      </details>
      <details>
        <summary>Как сохранить свои данные?</summary>
        <p>
          Откройте «Данные и приватность», скачайте JSON. Полноразмерные фото
          скачиваются отдельно из просмотра фотографии.
        </p>
      </details>
      <details>
        <summary>Как удалить аккаунт или отключиться?</summary>
        <p>
          В «Данные и приватность» отправьте подтверждённый запрос. В закрытой
          бете его обрабатывает администратор; автоматического удаления общей
          истории по нажатию одного участника нет. Сроки и юридические сведения
          должны быть утверждены до приёма реальных тестировщиков.
        </p>
      </details>
      <details>
        <summary>Приложение платное?</summary>
        <p>
          Нет. Просмотры, трофеи и все функции бесплатны.
          {donationURL
            ? " Добровольная поддержка доступна в настройках."
            : " Приём денег пока не подключён."}
        </p>
      </details>
      <p>
        Техническая закрытая бета. Условия и политика конфиденциальности пока
        находятся на согласовании.
      </p>
      <a href="https://t.me/lol5892" target="_blank" rel="noopener noreferrer">
        Связаться с разработчиком
      </a>
      {tour && <HelpTour onDone={() => setTour(false)} />}
    </section>
  );
}
