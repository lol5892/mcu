import { useState } from "react";
import { Camera, Plus, Trash2, MessageCircle } from "lucide-react";
import { catalog } from "../model";
import { useFamily } from "./FamilyProvider";
import { useAction, Feedback, Person, Reactions } from "./ui";
import { PhotoUpload, PrivatePhoto } from "./media";
import { Chat } from "./Chat";
export function Moments() {
  const f = useFamily(),
    a = useAction();
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
        <button
          className="round-add"
          aria-label="Добавить момент"
          onClick={() => setCreate(!create)}
        >
          <Plus />
        </button>
      </div>
      {create && (
        <form
          className="panel family-form"
          onSubmit={(e) => {
            e.preventDefault();
            void a.run(async () => {
              await f.mutate("moment", crypto.randomUUID(), {
                caption,
                project_id: project || null,
                moment_date: day,
              });
              setCreate(false);
              setCaption("");
            });
          }}
        >
          <h2>Ещё одно наше воспоминание</h2>
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
            Создайте момент, затем добавьте фотографии из галереи или камеры.
          </p>
          <button className="primary" disabled={a.busy || f.offline}>
            Сохранить момент
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
                {f.snapshot.media
                  .filter(
                    (p) =>
                      p.ready && p.kind === "moment" && p.target_id === m.id,
                  )
                  .map((media) => (
                    <PrivatePhoto key={media.id} media={media} />
                  ))}
              </div>
              {m.author_id === f.user?.id && (
                <PhotoUpload kind="moment" target={m.id} />
              )}
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
          <button onClick={() => setCreate(true)}>Добавить воспоминание</button>
        </div>
      )}
    </div>
  );
}
