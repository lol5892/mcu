import { useEffect, useRef, useState } from "react";
import { Send, Reply, PenLine, Trash2, EyeOff, X, MessageCircle } from "lucide-react";
import { useFamily } from "./FamilyProvider";
import type { Message } from "./types";
import { useAction, Feedback, Person, Reactions, displayDate } from "./ui";
import { PhotoPicker, PhotoPreviews, PrivatePhoto, SaveToMoments, mediaForTarget, uploadSelection, usePhotoSelection } from "./media";
import { usePrivateDraft } from "./drafts";
import { useUpdateBlocker } from "../pwa/useUpdateBlocker";
import "./media-chat.css";

export function Chat({ scope = "chat", target = "", title = "Всегда рядом", embedded = false }: { scope?: Message["scope"]; target?: string; title?: string; embedded?: boolean }) {
  const f = useFamily(), a = useAction();
  const [draft, setDraft, clearDraft] = usePrivateDraft(`chat:${f.user?.id}:${f.familyId}:${scope}:${target}`, { text: "", spoiler: false, replyId: "", editingId: "" });
  const { text, spoiler } = draft;
  const [revealed, setRevealed] = useState<Set<string>>(new Set()), [focused, setFocused] = useState(false), [newMessages, setNewMessages] = useState(false);
  const photos = usePhotoSelection();
  const room = useRef<HTMLElement>(null), list = useRef<HTMLDivElement>(null), input = useRef<HTMLTextAreaElement>(null);
  const nearBottom = useRef(true), sendId = useRef(crypto.randomUUID());
  const reply = f.snapshot.messages.find((m) => m.id === draft.replyId), editing = f.snapshot.messages.find((m) => m.id === draft.editingId);
  const rows = f.snapshot.messages.filter((m) => m.scope === scope && m.target === target).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  useUpdateBlocker("chat-draft", Boolean(text || photos.photos.length || a.busy || draft.editingId));
  useEffect(() => {
    const resize = () => {
      const viewport = window.visualViewport;
      room.current?.style.setProperty("--chat-viewport-height", `${viewport?.height || window.innerHeight}px`);
      room.current?.style.setProperty("--chat-viewport-top", `${viewport?.offsetTop || 0}px`);
      if (focused && nearBottom.current) list.current?.scrollTo({ top: list.current.scrollHeight });
    };
    resize();
    window.visualViewport?.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("scroll", resize);
    window.addEventListener("resize", resize);
    return () => {
      window.visualViewport?.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("scroll", resize);
      window.removeEventListener("resize", resize);
    };
  }, [focused]);
  useEffect(() => {
    if (nearBottom.current) list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "auto" });
    else setNewMessages(true);
  }, [rows.length, f.snapshot.mediaLinks.length]);
  async function send() {
    if ((!text.trim() && !photos.photos.length) || a.busy) return;
    await a.run(async () => {
      if (photos.photos.length && f.offline) throw Error("Для отправки фото нужен интернет. Фото и подпись останутся здесь до повторной попытки.");
      const ids = photos.photos.length ? await uploadSelection(photos.photos, f.rpc) : [];
      await f.mutate("message", editing?.id || sendId.current, {
        body: text.trim(), scope, target, spoiler, reply_to: reply?.id || null,
        ...(ids.length ? { media_ids: ids } : {}),
      }, editing?.version || 0);
      nearBottom.current = true;
      clearDraft();
      photos.clear();
      sendId.current = crypto.randomUUID();
    });
  }
  return <section ref={room} className={`chat-room chat-v21 ${embedded ? "chat-embedded" : ""} ${focused ? "chat-keyboard-active" : ""}`}>
    <div className="chat-title"><MessageCircle size={21} /><div><h2>{title}</h2><small>{f.offline ? "Нет сети · текст отправится после подключения" : "Наш разговор, только для двоих"}</small></div>{focused && <button type="button" className="text-button" onClick={() => { input.current?.blur(); setFocused(false); }}>Готово</button>}</div>
    <div ref={list} className="message-list" aria-live="polite" onScroll={() => {
      const el = list.current;
      if (el) nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
      if (nearBottom.current) setNewMessages(false);
    }}>
      {!rows.length && <div className="chat-empty"><span>✦</span><p>Тут можно сказать: «Ты видела это?!»<br />Или просто «Я рядом».</p></div>}
      {rows.map((m) => {
        const mine = m.author_id === f.user?.id;
        const pending = f.operations.find((o) => o.target === m.id && o.kind.startsWith("message"));
        const quoted = m.reply_to ? f.snapshot.messages.find((x) => x.id === m.reply_to) : null;
        const attachments = mediaForTarget(f.snapshot, "message", m.id);
        const hidden = m.spoiler && !revealed.has(m.id) && !mine;
        const session = scope === "session" ? f.snapshot.sessions.find((s) => s.id === target) : null;
        return <article className={"message " + (mine ? "mine" : "")} key={m.id}>
          <div className="message-author"><Person id={m.author_id} /><time dateTime={m.created_at}>{displayDate(m.created_at)}</time></div>
          {quoted && <blockquote>{quoted.spoiler ? "Ответ на сообщение со спойлером" : quoted.body.slice(0, 120) || "Фотография"}</blockquote>}
          <div className="message-bubble">
            {hidden ? <button className="spoiler-cover" onClick={() => setRevealed(new Set([...revealed, m.id]))}><EyeOff size={18} />Спойлер · нажмите, чтобы прочитать</button> : <>
              {!m.deleted_at && attachments.length > 0 && <div className="message-photos">{attachments.map((media) => <PrivatePhoto key={media.id} media={media} />)}</div>}
              {m.body && <p>{m.body}</p>}
            </>}
            {m.edited_at && <small>изменено</small>}
            {pending ? <small className="pending-label">{pending.state === "conflict" ? "Не отправлено · нужно сравнить изменения в синхронизации" : pending.state === "failed" ? "Не отправлено · откройте синхронизацию для повтора" : f.offline ? "Ожидает подключения" : "Отправляется…"}</small> : mine && <small className="delivery-label">Сохранено в нашем чате</small>}
          </div>
          {!m.deleted_at && <>
            {session && !hidden && !pending && attachments.length > 0 && <SaveToMoments media={attachments} projectId={session.project_id} sessionId={session.id} caption={m.body} />}
            <div className="message-tools"><button aria-label="Ответить на сообщение" onClick={() => { setDraft((d) => ({ ...d, replyId: m.id, editingId: "" })); input.current?.focus(); }}><Reply size={17} /></button>
              {mine && <><button aria-label="Редактировать моё сообщение" onClick={() => { setDraft((d) => ({ ...d, editingId: m.id, text: m.body, spoiler: m.spoiler })); input.current?.focus(); }}><PenLine size={17} /></button><button aria-label="Удалить моё сообщение" onClick={() => { if (confirm("Удалить ваше сообщение?")) void a.run(() => f.mutate("message_delete", m.id, {}, m.version)); }}><Trash2 size={17} /></button></>}
            </div><Reactions kind="message" id={m.id} />
          </>}
        </article>;
      })}
    </div>
    {newMessages && <button type="button" className="chat-new-messages" onClick={() => { nearBottom.current = true; list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" }); setNewMessages(false); }}>Новые сообщения ↓</button>}
    <form className="chat-compose" onSubmit={(e) => { e.preventDefault(); void send(); }}>
      {(reply || editing) && <div className="compose-context"><span>{editing ? "Редактируем сообщение" : `Ответ: ${reply?.spoiler ? "Спойлер" : reply?.body.slice(0, 70) || "Фотография"}`}</span><button type="button" aria-label="Отменить ответ или редактирование" onClick={() => clearDraft()}><X size={18} /></button></div>}
      {photos.photos.length > 0 && <PhotoPreviews photos={photos.photos} remove={photos.remove} busy={a.busy} />}
      <div className="compose-row">
        {!editing && <PhotoPicker compact disabled={a.busy || photos.photos.length >= 8} onFiles={photos.add} />}
        <textarea ref={input} aria-label="Текст сообщения" placeholder={photos.photos.length ? "Подпись к фотографии…" : "Напиши что-нибудь наше…"} maxLength={4000} rows={1} value={text} onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))} onFocus={() => setFocused(true)} onBlur={(e) => { if (!room.current?.contains(e.relatedTarget as Node | null)) setFocused(false); }} />
        <button className="send-button" onPointerDown={(e) => e.preventDefault()} type="submit" disabled={(!text.trim() && !photos.photos.length) || a.busy || (Boolean(photos.photos.length) && f.offline)} aria-label="Отправить сообщение"><Send size={21} /></button>
      </div>
      <div className="compose-footer"><label className="spoiler-toggle"><input type="checkbox" checked={spoiler} onChange={(e) => setDraft((d) => ({ ...d, spoiler: e.target.checked }))} /><EyeOff size={16} />Содержит спойлер</label>{a.busy && <span role="status">{photos.photos.length ? "Отправляем фотографии…" : "Сохраняем…"}</span>}</div>
      <Feedback text={a.feedback} />
    </form>
  </section>;
}
