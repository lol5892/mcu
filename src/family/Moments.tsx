import { useRef, useState } from "react";
import { Camera, Trash2, MessageCircle } from "lucide-react";
import { catalog } from "../model";
import { useFamily } from "./FamilyProvider";
import { useAction, Feedback, Person, Reactions } from "./ui";
import { PhotoUpload, PrivatePhoto, PhotoPicker, PhotoPreviews, usePhotoSelection, uploadSelection, mediaForTarget } from "./media";
import { Chat } from "./Chat";
export function Moments() {
  const f = useFamily(),
    a = useAction(), selection = usePhotoSelection();
  const publishId = useRef(crypto.randomUUID());
  const [create, setCreate] = useState(false),
    [caption, setCaption] = useState(""),
    [project, setProject] = useState(""),
    [day, setDay] = useState(new Date().toLocaleDateString("en-CA")),
    [comments, setComments] = useState<string | null>(null);
  if (comments)
    return (
      <>
        <button className="text-button" onClick={() => setComments(null)}>
          ← К нашим моментам
        </button>
        <Chat scope="moment" target={comments} title="Об этом вечере" />
      </>
    );
  return (
    <div className="moments-page">
      <div className="feature-heading">
        <div>
          <div className="eyebrow">МАЛЕНЬКИЕ ВЕЧЕРА · БОЛЬШИЕ ВОСПОМИНАНИЯ</div>
          <h1>Наши моменты</h1>
          <p>Фильм закончится. А это останется с нами.</p>
        </div>
        {!create && <PhotoPicker onFiles={(files) => { selection.add(files); setCreate(true); }} disabled={a.busy} label="Добавить фото" />}
      </div>
      {create && (
        <form
          className="panel family-form"
          onSubmit={(e) => {
            e.preventDefault();
            void a.run(async () => {
              const media_ids = await uploadSelection(selection.photos, f.rpc);
              await f.mutate("moment", publishId.current, {
                media_ids,
                caption,
                project_id: project || null,
                moment_date: day,
              });
              publishId.current = crypto.randomUUID();
              selection.clear();
              setCreate(false);
              setCaption("");
            });
          }}
        >
          <h2>Ещё одно наше воспоминание</h2>
          <PhotoPicker onFiles={selection.add} disabled={a.busy} />
          <PhotoPreviews photos={selection.photos} remove={selection.remove} busy={a.busy} />
          <label>
            Подпись
            <textarea
              aria-label="Подпись воспоминания"
              value={caption}
              maxLength={2000}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Пицца, плед и целая вселенная…"
            />
          </label>
          <label>
            Фильм
            <select
              aria-label="Фильм воспоминания"
              value={project}
              onChange={(e) => setProject(e.target.value)}
            >
              <option value="">Просто наш вечер</option>
              {catalog
                .filter((p) => p.section !== "future")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Дата
            <input
              type="date"
              required
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
          </label>
          <p className="muted">
            Выберите фотографии и добавьте подпись. Всё появится в ленте вместе.
          </p>
          <button className="primary" disabled={a.busy || f.offline || !selection.photos.length}>
            Опубликовать
          </button>
        </form>
      )}
      <Feedback text={a.feedback} />
      <div className="moments-feed">
        {[...f.snapshot.moments]
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .map((m) => (
            <article className="moment-card" key={m.id}>
              <header>
                <Person id={m.author_id} />
                <span>
                  {new Date(m.moment_date + "T12:00:00").toLocaleDateString(
                    "ru-RU",
                    { day: "numeric", month: "long", year: "numeric" },
                  )}
                </span>
                {m.author_id === f.user?.id && (
                  <button
                    aria-label="Удалить моё воспоминание"
                    onClick={() => {
                      if (confirm("Удалить ваше воспоминание?"))
                        void a.run(() =>
                          f.mutate("moment_delete", m.id, {}, m.version),
                        );
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </header>
              <div className="moment-photos">
                {mediaForTarget(f.snapshot, "moment", m.id)
                  .map((media) => (
                    <PrivatePhoto key={media.id} media={media} />
                  ))}
              </div>
              <PhotoUpload kind="moment" target={m.id} />
              <div className="moment-copy">
                {m.project_id && (
                  <small className="gold">
                    {catalog.find((p) => p.id === m.project_id)?.title}
                  </small>
                )}
                <p>{m.caption}</p>
                <Reactions kind="moment" id={m.id} />
                <button
                  className="text-button"
                  onClick={() => setComments(m.id)}
                >
                  <MessageCircle size={16} />
                  Наши комментарии
                </button>
              </div>
            </article>
          ))}
      </div>
      {!f.snapshot.moments.length && !create && (
        <div className="empty">
          <Camera />
          <h2>У каждого вечера своя обложка</h2>
          <p>Сохраните первый кадр нашей маленькой вселенной.</p>
          <p>Нажмите «Добавить фото» вверху.</p>
        </div>
      )}
    </div>
  );
}
