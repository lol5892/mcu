import { useState } from "react";
import {
  Mail,
  Heart,
  Plus,
  Send,
  Clock3,
  PenLine,
  ArrowLeft,
  Bookmark,
  Reply,
  Trash2,
  X,
} from "lucide-react";
import { useFamily } from "./FamilyProvider";
import type { Letter } from "./types";
import { PhotoUpload, PrivatePhoto } from "./media";
import { useAction, Feedback, Person, Reactions, displayDate } from "./ui";
const styles = {
  romantic: "Романтическое",
  cosmic: "Космическое",
  minimal: "Минималистичное",
  surprise: "Письмо-сюрприз",
} as const;
export function Letters({ initialId }: { initialId?: string }) {
  const f = useFamily(),
    a = useAction();
  const [filter, setFilter] = useState("received"),
    [opened, setOpened] = useState<string | null>(initialId || null),
    [unsealed, setUnsealed] = useState(false),
    [editing, setEditing] = useState<Partial<Letter> | null>(null);
  const letter = f.snapshot.letters.find((l) => l.id === opened);
  const mine = letter?.author_id === f.user?.id;
  const favorite = (id: string) =>
    f.snapshot.favorites.some((x) => x.letter_id === id);
  async function save(status: Letter["status"]) {
    if (!editing) return;
    const id = editing.id || crypto.randomUUID();
    if (!editing.id) setEditing({ ...editing, id });
    const payload = {
      title: editing.title?.trim(),
      body: editing.body?.trim(),
      style: editing.style || "romantic",
      status,
      scheduled_at:
        status === "scheduled"
          ? new Date(editing.scheduled_at || "").toISOString()
          : null,
      reply_to: editing.reply_to || null,
    };
    await a.run(async () => {
      if (!payload.title || !payload.body)
        throw Error("Добавьте заголовок и текст письма.");
      if (status !== "draft" && f.offline)
        throw Error("Для отправки письма нужен интернет.");
      await f.mutate("letter", id, payload, editing.version || 0);
      setEditing(null);
      setOpened(id);
      setUnsealed(true);
      if (status === "draft" && f.offline)
        a.setFeedback("Черновик сохранён в очереди на этом устройстве.");
    });
  }
  if (editing)
    return (
      <div className="letters-editor">
        <button className="text-button" onClick={() => setEditing(null)}>
          <ArrowLeft size={17} />К письмам
        </button>
        <div className="eyebrow">
          ОТ {f.role === "anton" ? "АНТОНА" : "ТАНИ"} · ДЛЯ{" "}
          {f.role === "anton" ? "ТАНИ" : "АНТОНА"}
        </div>
        <h2>Слова, которые хочется сохранить</h2>
        <label>
          Заголовок
          <input
            aria-label="Заголовок письма"
            maxLength={120}
            value={editing.title || ""}
            onChange={(e) => setEditing({ ...editing, title: e.target.value })}
            placeholder="Для тебя…"
          />
        </label>
        <label>
          Текст письма
          <textarea
            aria-label="Текст письма"
            maxLength={20000}
            rows={9}
            value={editing.body || ""}
            onChange={(e) => setEditing({ ...editing, body: e.target.value })}
            placeholder="Здесь можно сказать самое важное"
          />
        </label>
        <div className="letter-style-picker">
          {Object.entries(styles).map(([key, label]) => (
            <button
              key={key}
              aria-pressed={editing.style === key}
              className={"style-choice " + key}
              onClick={() =>
                setEditing({ ...editing, style: key as Letter["style"] })
              }
            >
              {key === "cosmic"
                ? "✦"
                : key === "minimal"
                  ? "—"
                  : key === "surprise"
                    ? "✧"
                    : "♡"}
              <span>{label}</span>
            </button>
          ))}
        </div>
        <label>
          Доставить в выбранное время
          <input
            type="datetime-local"
            aria-label="Время отправки письма"
            value={editing.scheduled_at?.slice(0, 16) || ""}
            onChange={(e) =>
              setEditing({ ...editing, scheduled_at: e.target.value })
            }
          />
          <small>
            Ваш часовой пояс: {Intl.DateTimeFormat().resolvedOptions().timeZone}
            . До доставки получатель не увидит письмо.
          </small>
        </label>
        <div className="editor-actions">
          <button
            className="wide-button"
            disabled={a.busy}
            onClick={() => void save("draft")}
          >
            <PenLine size={17} />
            Сохранить черновик
          </button>
          <button
            className="primary"
            disabled={a.busy || f.offline}
            onClick={() =>
              void save(editing.scheduled_at ? "scheduled" : "delivered")
            }
          >
            {editing.scheduled_at ? <Clock3 size={17} /> : <Send size={17} />}{" "}
            {editing.scheduled_at ? "Запланировать" : "Отправить сейчас"}
          </button>
        </div>
        <p className="muted">
          Для прикрепления фотографии сначала сохраните черновик, затем откройте
          его в архиве.
        </p>
        <Feedback text={a.feedback} />
      </div>
    );
  if (letter)
    return (
      <div className="letter-reading">
        <button
          className="text-button"
          onClick={() => {
            setOpened(null);
            setUnsealed(false);
          }}
        >
          <ArrowLeft size={17} />
          Все письма
        </button>
        {!unsealed ? (
          <div className={"envelope-stage " + letter.style}>
            <div className="eyebrow">ЛИЧНОЕ · ТОЛЬКО ДЛЯ ТЕБЯ</div>
            <button
              className="envelope"
              aria-label="Открыть конверт"
              onClick={() => {
                setUnsealed(true);
                if (!mine && letter.status === "delivered")
                  void a.run(() => f.mutate("letter_read", letter.id, {}));
              }}
            >
              <div className="envelope-flap" />
              <Heart size={33} fill="currentColor" />
            </button>
            <h2>{letter.title}</h2>
            <Person id={letter.author_id} />
            <p>Нажми на конверт. Внутри — немного нас.</p>
          </div>
        ) : (
          <article className={"letter-paper " + letter.style}>
            <div className="paper-header">
              <Heart size={19} />
              <small>
                {letter.status === "delivered"
                  ? displayDate(letter.delivered_at || letter.created_at)
                  : letter.status === "scheduled"
                    ? `Доставим ${displayDate(letter.scheduled_at!)}`
                    : "Личный черновик"}
              </small>
              <button
                aria-label="Избранное письмо"
                onClick={() =>
                  void a.run(() =>
                    f.mutate("letter_favorite", letter.id, {
                      value: !favorite(letter.id),
                    }),
                  )
                }
              >
                <Bookmark
                  size={19}
                  fill={favorite(letter.id) ? "currentColor" : "none"}
                />
              </button>
            </div>
            <h1>{letter.title}</h1>
            <div className="letter-body">
              {letter.body.split("\n").map((line, i) => (
                <p key={i}>{line || "\u00a0"}</p>
              ))}
            </div>
            {f.snapshot.media
              .filter(
                (m) =>
                  m.ready && m.kind === "letter" && m.target_id === letter.id,
              )
              .map((m) => (
                <PrivatePhoto key={m.id} media={m} />
              ))}
            <div className="paper-signature">
              <Person id={letter.author_id} />
              {letter.read_at && (
                <small>Прочитано {displayDate(letter.read_at)}</small>
              )}
            </div>
            {letter.status === "delivered" && (
              <Reactions kind="letter" id={letter.id} />
            )}
            <button className="text-button" onClick={() => setUnsealed(false)}>
              Ещё раз открыть конверт
            </button>
          </article>
        )}
        <div className="letter-actions">
          {mine && letter.status !== "delivered" ? (
            <>
              <button
                className="wide-button"
                onClick={() =>
                  setEditing({
                    ...letter,
                    scheduled_at: letter.scheduled_at
                      ? localDateTime(letter.scheduled_at)
                      : "",
                  })
                }
              >
                <PenLine size={16} />
                Продолжить письмо
              </button>
              <PhotoUpload kind="letter" target={letter.id} />
              {letter.status === "scheduled" ? (
                <button
                  className="text-button"
                  onClick={() =>
                    void a.run(() =>
                      f.mutate(
                        "letter",
                        letter.id,
                        {
                          title: letter.title,
                          body: letter.body,
                          style: letter.style,
                          status: "cancelled",
                        },
                        letter.version,
                      ),
                    )
                  }
                >
                  <X size={15} />
                  Отменить запланированную отправку
                </button>
              ) : (
                <button
                  className="text-button"
                  onClick={() => {
                    if (confirm("Удалить ваш черновик?"))
                      void a.run(async () => {
                        await f.mutate(
                          "letter_delete",
                          letter.id,
                          {},
                          letter.version,
                        );
                        setOpened(null);
                      });
                  }}
                >
                  <Trash2 size={15} />
                  Удалить черновик
                </button>
              )}
            </>
          ) : (
            !mine &&
            letter.status === "delivered" && (
              <button
                className="primary"
                onClick={() =>
                  setEditing({
                    title: `Re: ${letter.title}`.slice(0, 120),
                    body: "",
                    style: letter.style,
                    reply_to: letter.id,
                  })
                }
              >
                <Reply size={17} />
                Написать ответ
              </button>
            )
          )}
        </div>
        <Feedback text={a.feedback} />
      </div>
    );
  const rows = f.snapshot.letters
    .filter((l) =>
      filter === "received"
        ? l.recipient_id === f.user?.id && l.status === "delivered"
        : filter === "sent"
          ? l.author_id === f.user?.id && l.status === "delivered"
          : filter === "favorites"
            ? favorite(l.id)
            : l.author_id === f.user?.id && l.status !== "delivered",
    )
    .sort((a, b) =>
      (b.delivered_at || b.created_at).localeCompare(
        a.delivered_at || a.created_at,
      ),
    );
  return (
    <div className="letters-home">
      <section className="letters-hero">
        <div className="eyebrow">СЛОВА, КОТОРЫЕ ОСТАЮТСЯ</div>
        <Mail size={45} />
        <h1>Письма друг другу</h1>
        <p>
          В нашей вселенной есть место
          <br />
          для самого нежного.
        </p>
        <button
          className="primary"
          onClick={() => setEditing({ title: "", body: "", style: "romantic" })}
        >
          <Plus size={18} />
          Написать любимому человеку
        </button>
      </section>
      <div className="section-pills personal-tabs">
        {[
          ["received", "Для меня"],
          ["sent", "От меня"],
          ["drafts", "Черновики и планы"],
          ["favorites", "Избранное"],
        ].map(([key, title]) => (
          <button
            key={key}
            className={filter === key ? "selected" : ""}
            onClick={() => setFilter(key)}
          >
            {title}
          </button>
        ))}
      </div>
      <div className="letters-list">
        {rows.map((l) => (
          <button
            className={"letter-tile " + l.style}
            key={l.id}
            onClick={() => {
              setOpened(l.id);
              setUnsealed(false);
            }}
          >
            <div className="letter-tile-icon">
              <Mail size={24} />
            </div>
            <div>
              <small>
                {l.status === "draft"
                  ? "ЧЕРНОВИК"
                  : l.status === "scheduled"
                    ? "ЖДЁТ СВОЕГО МОМЕНТА"
                    : l.status === "cancelled"
                      ? "ОТПРАВКА ОТМЕНЕНА"
                      : l.recipient_id === f.user?.id
                        ? "ДЛЯ ТЕБЯ"
                        : "ОТПРАВЛЕНО"}
              </small>
              <h3>{l.title}</h3>
              <span>
                {displayDate(l.scheduled_at || l.delivered_at || l.created_at)}
              </span>
            </div>
            {favorite(l.id) && (
              <Heart className="gold" size={16} fill="currentColor" />
            )}
          </button>
        ))}
      </div>
      {!rows.length && (
        <div className="empty">
          <Mail />
          <h2>Здесь начнётся ещё одна наша история</h2>
          <p>Несколько тёплых слов могут стать любимым воспоминанием.</p>
        </div>
      )}
      <Feedback text={a.feedback} />
    </div>
  );
}
function localDateTime(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
