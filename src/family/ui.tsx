import { useState } from "react";
import { Heart, X } from "lucide-react";
import { errorText } from "./client";
import { useFamily } from "./FamilyProvider";
import { personalName } from "./projection";
export function useAction() {
  const [busy, setBusy] = useState(false),
    [feedback, setFeedback] = useState("");
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setFeedback("");
    try {
      await action();
    } catch (e) {
      setFeedback(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return { busy, feedback, setFeedback, run };
}
export function Feedback({ text }: { text: string }) {
  return text ? (
    <p className="form-message" role="status">
      {text}
    </p>
  ) : null;
}
export function Person({ id }: { id: string }) {
  const f = useFamily();
  const name = personalName(f.snapshot, id);
  return (
    <span className="person">
      {f.avatars[id] ? (
        <img className="avatar" src={f.avatars[id]} alt={name} />
      ) : (
        <span className={"avatar " + (name === "Таня" ? "tanya" : "anton")}>
          {name[0]}
        </span>
      )}
      {name}
    </span>
  );
}
export function Sheet({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="family-sheet-backdrop">
      <section
        className="family-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <div>
            <div className="eyebrow">НАША МАЛЕНЬКАЯ ВСЕЛЕННАЯ</div>
            <h2>{title}</h2>
          </div>
          <button aria-label="Закрыть окно" onClick={close}>
            <X size={23} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function Reactions({
  kind,
  id,
}: {
  kind: "letter" | "message" | "moment" | "session";
  id: string;
}) {
  const f = useFamily();
  const a = useAction();
  return (
    <div className="quick-reactions" aria-label="Наши реакции">
      {["❤️", "😂", "😱", "🔥", "🥹"].map((emoji) => {
        const all = f.snapshot.reactions.filter(
          (r) => r.kind === kind && r.target_id === id && r.emoji === emoji,
        );
        const mine = all.some((r) => r.user_id === f.user?.id);
        return (
          <button
            key={emoji}
            aria-pressed={mine}
            disabled={a.busy}
            className={mine ? "selected" : ""}
            onClick={() =>
              void a.run(() =>
                f.mutate("reaction", id, { kind, emoji, value: !mine }),
              )
            }
          >
            {emoji}
            <small>{all.length || ""}</small>
          </button>
        );
      })}
      <Feedback text={a.feedback} />
    </div>
  );
}
export const displayDate = (date: string) =>
  new Date(date).toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
export const projectName = (
  id: string,
  projects: { id: string; title: string }[],
) => projects.find((p) => p.id === id)?.title || id;
