import { useEffect, useRef, useState } from "react";
import {
  Send,
  Reply,
  PenLine,
  Trash2,
  EyeOff,
  X,
  MessageCircle,
} from "lucide-react";
import { useFamily } from "./FamilyProvider";
import type { Message } from "./types";
import { useAction, Feedback, Person, Reactions, displayDate } from "./ui";
export function Chat({
  scope = "chat",
  target = "",
  title = "Всегда рядом",
}: {
  scope?: Message["scope"];
  target?: string;
  title?: string;
}) {
  const f = useFamily(),
    a = useAction();
  const [text, setText] = useState(""),
    [spoiler, setSpoiler] = useState(false),
    [reply, setReply] = useState<Message | null>(null),
    [editing, setEditing] = useState<Message | null>(null),
    [revealed, setRevealed] = useState<Set<string>>(new Set());
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const rows = f.snapshot.messages
    .filter((m) => m.scope === scope && m.target === target)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  useEffect(() => {
    bottom.current?.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "nearest",
    });
  }, [rows.length]);
  async function send() {
    if (!text.trim()) return;
    await a.run(async () => {
      await f.mutate(
        "message",
        editing?.id || crypto.randomUUID(),
        {
          body: text.trim(),
          scope,
          target,
          spoiler,
          reply_to: reply?.id || null,
        },
        editing?.version || 0,
      );
      setText("");
      setSpoiler(false);
      setReply(null);
      setEditing(null);
    });
  }
  return (
    <section className="chat-room">
      <div className="chat-title">
        <MessageCircle size={21} />
        <div>
          <h2>{title}</h2>
          <small>
            {f.offline
              ? "Нет сети · сообщения ждут отправки"
              : "Наш разговор, только для двоих"}
          </small>
        </div>
      </div>
      <div className="message-list" aria-live="polite">
        {!rows.length && (
          <div className="chat-empty">
            <span>✦</span>
            <p>
              Тут можно сказать: «Ты видела это?!»
              <br />
              Или просто «Я рядом».
            </p>
          </div>
        )}
        {rows.map((m) => {
          const mine = m.author_id === f.user?.id;
          const pending = f.operations.some((o) => o.target === m.id);
          const quoted = m.reply_to
            ? f.snapshot.messages.find((x) => x.id === m.reply_to)
            : null;
          return (
            <article className={"message " + (mine ? "mine" : "")} key={m.id}>
              <div className="message-author">
                <Person id={m.author_id} />
                <time>{displayDate(m.created_at)}</time>
              </div>
              {quoted && (
                <blockquote>
                  {quoted.spoiler
                    ? "Ответ на сообщение со спойлером"
                    : quoted.body.slice(0, 120)}
                </blockquote>
              )}
              <div className="message-bubble">
                {m.spoiler && !revealed.has(m.id) && !mine ? (
                  <button
                    className="spoiler-cover"
                    onClick={() => setRevealed(new Set([...revealed, m.id]))}
                  >
                    <EyeOff size={18} />
                    Спойлер · нажмите, чтобы прочитать
                  </button>
                ) : (
                  <p>{m.body}</p>
                )}
                {m.edited_at && <small>изменено</small>}
                {pending && (
                  <small className="pending-label">В очереди на отправку</small>
                )}
              </div>
              {!m.deleted_at && (
                <>
                  <div className="message-tools">
                    <button
                      aria-label="Ответить на сообщение"
                      onClick={() => {
                        setReply(m);
                        input.current?.focus();
                      }}
                    >
                      <Reply size={13} />
                    </button>
                    {mine && (
                      <>
                        <button
                          aria-label="Редактировать моё сообщение"
                          onClick={() => {
                            setEditing(m);
                            setText(m.body);
                            setSpoiler(m.spoiler);
                            input.current?.focus();
                          }}
                        >
                          <PenLine size={13} />
                        </button>
                        <button
                          aria-label="Удалить моё сообщение"
                          onClick={() => {
                            if (confirm("Удалить ваше сообщение?"))
                              void a.run(() =>
                                f.mutate("message_delete", m.id, {}, m.version),
                              );
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                  <Reactions kind="message" id={m.id} />
                </>
              )}
            </article>
          );
        })}
        <div ref={bottom} />
      </div>
      <form
        className="chat-compose"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        {(reply || editing) && (
          <div className="compose-context">
            <span>
              {editing
                ? "Редактируем сообщение"
                : `Ответ: ${reply?.spoiler ? "Спойлер" : reply?.body.slice(0, 70)}`}
            </span>
            <button
              type="button"
              aria-label="Отменить ответ или редактирование"
              onClick={() => {
                setReply(null);
                setEditing(null);
                setText("");
              }}
            >
              <X size={15} />
            </button>
          </div>
        )}
        <div className="compose-row">
          <textarea
            ref={input}
            aria-label="Текст сообщения"
            placeholder="Напиши что-нибудь наше…"
            maxLength={4000}
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            className="send-button"
            type="submit"
            disabled={!text.trim() || a.busy}
            aria-label="Отправить сообщение"
          >
            <Send size={21} />
          </button>
        </div>
        <label className="spoiler-toggle">
          <input
            type="checkbox"
            checked={spoiler}
            onChange={(e) => setSpoiler(e.target.checked)}
          />
          <EyeOff size={13} />
          Содержит спойлер
        </label>
        <Feedback text={a.feedback} />
      </form>
    </section>
  );
}
